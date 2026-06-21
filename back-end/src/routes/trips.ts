import type { Queue } from 'bullmq';
import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ensureTripOwnership, getTripEngagementCounts } from '../services/metrics.js';
import { getCachedMainFeed, invalidateMainFeedCache, setCachedMainFeed } from '../services/feed.js';
import { getTripTimeline, invalidateTripTimeline } from '../services/timeline.js';
import { suggestPlacesForLocation } from '../services/places.js';
import { uploadActivityImage } from '../services/storage.js';
import {
  callASIOneParser,
  callASIOneVoiceIntent,
  schedulePokeReminder,
  transcribeDeepgramAudio,
} from '../services/integrations.js';

type TripsRouterOptions = {
  itineraryQueue: Queue;
};

type ActivityRow = {
  id: number;
  trip_id: number;
  title: string;
  description: string | null;
  cost: number | string;
  start_time: string | null;
  end_time: string | null;
  location_coords: unknown;
  location_name: string | null;
  rating: number | null;
  tags: string[] | null;
  venue_hours: unknown;
  weather_snapshot: unknown;
  created_at: string;
};

type RoutePreviewPoint = {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
};

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePostgisPointHex(input: string) {
  const hex = input.trim();
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 2) {
    return null;
  }

  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length < 1 + 4 + 16) {
    return null;
  }

  const littleEndian = buffer.readUInt8(0) === 1;
  const readUInt32 = littleEndian ? buffer.readUInt32LE.bind(buffer) : buffer.readUInt32BE.bind(buffer);
  const readDouble = littleEndian ? buffer.readDoubleLE.bind(buffer) : buffer.readDoubleBE.bind(buffer);

  let offset = 1;
  const geometryType = readUInt32(offset);
  offset += 4;

  if ((geometryType & 0x0fffffff) !== 1) {
    return null;
  }

  if (geometryType & 0x20000000) {
    offset += 4;
  }

  if (buffer.length < offset + 16) {
    return null;
  }

  const longitude = readDouble(offset);
  const latitude = readDouble(offset + 8);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function parseLocationCoords(input: unknown) {
  if (!input) {
    return null;
  }

  if (typeof input === 'string') {
    const match = input.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) {
      return input;
    }
  }

  if (typeof input === 'object') {
    const maybeObject = input as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown };

    if (typeof maybeObject.latitude === 'number' && typeof maybeObject.longitude === 'number') {
      return `POINT(${maybeObject.longitude} ${maybeObject.latitude})`;
    }

    if (typeof maybeObject.lat === 'number' && typeof maybeObject.lng === 'number') {
      return `POINT(${maybeObject.lng} ${maybeObject.lat})`;
    }
  }

  return null;
}

function parseRoutePreviewPoint(activity: { id: number; title: string; location_coords?: unknown }): RoutePreviewPoint | null {
  const input = activity.location_coords;

  if (typeof input === 'string') {
    const parsedHex = parsePostgisPointHex(input);
    if (parsedHex) {
      return {
        id: activity.id,
        title: activity.title,
        latitude: parsedHex.latitude,
        longitude: parsedHex.longitude,
      };
    }

    const match = input.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (!match) return null;

    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      id: activity.id,
      title: activity.title,
      latitude,
      longitude,
    };
  }

  if (typeof input === 'object' && input) {
    const maybeObject = input as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown; coordinates?: unknown };

    if (typeof maybeObject.latitude === 'number' && typeof maybeObject.longitude === 'number') {
      return {
        id: activity.id,
        title: activity.title,
        latitude: maybeObject.latitude,
        longitude: maybeObject.longitude,
      };
    }

    if (typeof maybeObject.lat === 'number' && typeof maybeObject.lng === 'number') {
      return {
        id: activity.id,
        title: activity.title,
        latitude: maybeObject.lat,
        longitude: maybeObject.lng,
      };
    }

    if (Array.isArray(maybeObject.coordinates) && maybeObject.coordinates.length >= 2) {
      const [longitude, latitude] = maybeObject.coordinates;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return {
          id: activity.id,
          title: activity.title,
          latitude,
          longitude,
        };
      }
    }
  }

  return null;
}

function buildRoutePreviewPoints(activities: Array<{ id: number; title: string; location_coords?: unknown }> | null | undefined) {
  return (activities ?? [])
    .map((activity) => parseRoutePreviewPoint(activity))
    .filter((point): point is RoutePreviewPoint => point !== null);
}

async function loadRoutePreviewPointsByTripId(tripIds: Array<number | string>) {
  const map = new Map<number | string, RoutePreviewPoint[]>();

  if (!tripIds.length) {
    return map;
  }

  const { data, error } = await supabase
    .from('activities')
    .select('trip_id, id, title, location_coords')
    .in('trip_id', tripIds);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as Array<{ trip_id: number | string; id: number; title: string; location_coords?: unknown }>) {
    const point = parseRoutePreviewPoint({ id: row.id, title: row.title, location_coords: row.location_coords });
    if (!point) continue;

    const existing = map.get(row.trip_id);
    if (existing) existing.push(point);
    else map.set(row.trip_id, [point]);
  }

  return map;
}

function getActivityPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  const fieldMap = [
    ['title', 'title'],
    ['description', 'description'],
    ['cost', 'cost'],
    ['start_time', 'start_time'],
    ['startTime', 'start_time'],
    ['end_time', 'end_time'],
    ['endTime', 'end_time'],
    ['location_name', 'location_name'],
    ['locationName', 'location_name'],
    ['tags', 'tags'],
    ['rating', 'rating'],
    ['venue_hours', 'venue_hours'],
    ['venueHours', 'venue_hours'],
    ['weather_snapshot', 'weather_snapshot'],
    ['weatherSnapshot', 'weather_snapshot'],
    ['location_coords', 'location_coords'],
    ['locationCoords', 'location_coords'],
    ['coordinates', 'location_coords'],
  ] as const;

  for (const [inputKey, outputKey] of fieldMap) {
    if (body[inputKey] !== undefined) {
      payload[outputKey] = body[inputKey];
    }
  }

  if (payload.location_coords !== undefined) {
    payload.location_coords = parseLocationCoords(payload.location_coords);
  }

  if (payload.cost !== undefined) {
    payload.cost = toNumber(payload.cost);
  }

  return payload;
}

async function syncTripRollups(tripId: number | string) {
  const { data: activities, error } = await supabase
    .from('activities')
    .select('cost, start_time, end_time')
    .eq('trip_id', tripId);

  if (error) {
    throw error;
  }

  const totalBudget = (activities ?? []).reduce((sum, activity) => sum + toNumber(activity.cost), 0);

  let totalDriveTimeMinutes: number | null = null;
  if (activities?.length) {
    const computedMinutes = activities.reduce((sum, activity) => {
      if (!activity.start_time || !activity.end_time) {
        return sum;
      }

      const startTime = new Date(activity.start_time);
      const endTime = new Date(activity.end_time);

      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        return sum;
      }

      return sum + Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    }, 0);

    totalDriveTimeMinutes = computedMinutes;
  }

  const { error: tripUpdateError } = await supabase
    .from('trips')
    .update({
      total_budget: totalBudget,
      total_drive_time_minutes: totalDriveTimeMinutes,
    })
    .eq('id', tripId);

  if (tripUpdateError) {
    throw tripUpdateError;
  }
}

export function createTripsRouter({ itineraryQueue }: TripsRouterOptions) {
  const router = Router();

  router.post(
    '/generate',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { title, rawText } = req.body;

        if (!title || !rawText) {
          res.status(400).json({
            error: 'Missing mandatory tracking parameters: title and rawText are required.',
          });
          return;
        }

        if (!userId) {
          res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
          return;
        }

        const { data: trip, error: tripError } = await supabase
          .from('trips')
          .insert({
            user_id: userId,
            title,
            is_public: false,
            total_budget: 0,
            total_distance_miles: null,
            total_drive_time_minutes: null,
            total_gas_cost: null,
          })
          .select('id')
          .single();

        if (tripError || !trip) {
          console.error('Supabase DB Trip insertion failed:', tripError);
          res.status(500).json({ error: 'Database transaction failed while creating trip layout shell.' });
          return;
        }

        const job = await itineraryQueue.add(`parse_${trip.id}`, {
          tripId: trip.id,
          userId,
          rawText,
        });

        await invalidateMainFeedCache();

        res.status(202).json({
          success: true,
          message: 'Itinerary submitted successfully. Mapping engines are compiling routes.',
          tripId: trip.id,
          jobId: job.id,
        });
      } catch (error) {
        console.error('Critical failure handling trip generation route sequence:', error);
        res.status(500).json({ error: 'Internal Server Error processing automation flow.' });
      }
    }
  );

  router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { title } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!title) {
        res.status(400).json({ error: 'Title is required to create a trip draft.' });
        return;
      }

      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          user_id: userId,
          title,
          is_public: false,
          total_budget: 0,
          total_distance_miles: null,
          total_drive_time_minutes: null,
          total_gas_cost: null,
        })
        .select('id, title, is_public, created_at')
        .single();

      if (error || !trip) {
        res.status(500).json({ error: 'Failed to create trip draft.' });
        return;
      }

      res.status(201).json({ trip });
    } catch (error) {
      console.error('Error creating trip draft:', error);
      res.status(500).json({ error: 'Failed to create trip draft.' });
    }
  });

  router.post('/place-suggestions', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationQuery, searchQuery, originCoords, radiusMeters, limit } = req.body ?? {};

      if (!locationQuery || typeof locationQuery !== 'string') {
        res.status(400).json({ error: 'locationQuery is required to fetch nearby places.' });
        return;
      }

      const parsedRadius = Number(radiusMeters);
      const parsedLimit = Number(limit);

      const data = await suggestPlacesForLocation(
        locationQuery,
        typeof searchQuery === 'string' ? searchQuery : '',
        originCoords && typeof originCoords === 'object' ? originCoords : undefined,
        Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 3000,
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20
      );

      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching place suggestions:', error);
      res.status(500).json({ error: 'Failed to fetch place suggestions.' });
    }
  });

  router.post('/voice-recommendations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { base64Audio, mimeType, locationQuery, originCoords, radiusMeters, limit } = req.body ?? {};

      if (!base64Audio || typeof base64Audio !== 'string') {
        res.status(400).json({ error: 'base64Audio is required for voice recommendations.' });
        return;
      }

      const transcription = await transcribeDeepgramAudio(
        base64Audio,
        typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'audio/mp4'
      );
      const locationContext =
        originCoords && typeof originCoords === 'object' && Number.isFinite(Number((originCoords as { latitude?: unknown }).latitude))
          ? {
              label: typeof locationQuery === 'string' && locationQuery.trim() ? locationQuery.trim() : 'Current location',
              latitude: Number((originCoords as { latitude?: unknown }).latitude),
              longitude: Number((originCoords as { longitude?: unknown }).longitude),
            }
          : {
              label: typeof locationQuery === 'string' && locationQuery.trim() ? locationQuery.trim() : null,
            };

      const intent = await callASIOneVoiceIntent(transcription, locationContext);

      const parsedRadius = Number(radiusMeters);
      const parsedLimit = Number(limit);
      const resolvedLocationQuery = intent.location_query ?? (typeof locationQuery === 'string' ? locationQuery : 'Current location');
      const resolvedSearchQuery = intent.search_query || transcription.transcript;

      const data = await suggestPlacesForLocation(
        resolvedLocationQuery,
        resolvedSearchQuery,
        originCoords && typeof originCoords === 'object' ? originCoords : undefined,
        Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : intent.radius_meters,
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : intent.limit
      );

      res.status(200).json({
        transcript: transcription.transcript,
        intent,
        ...data,
      });
    } catch (error) {
      console.error('Error fetching voice recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch voice recommendations.' });
    }
  });

  router.post('/voice-generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { base64Audio, mimeType, title, locationQuery, originCoords } = req.body ?? {};
      if (!base64Audio || typeof base64Audio !== 'string') {
        res.status(400).json({ error: 'base64Audio is required for voice itinerary generation.' });
        return;
      }

      const transcription = await transcribeDeepgramAudio(
        base64Audio,
        typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'audio/mp4'
      );
      const locationContext =
        originCoords && typeof originCoords === 'object' && Number.isFinite(Number((originCoords as { latitude?: unknown }).latitude))
          ? {
              label: typeof locationQuery === 'string' && locationQuery.trim() ? locationQuery.trim() : 'Current location',
              latitude: Number((originCoords as { latitude?: unknown }).latitude),
              longitude: Number((originCoords as { longitude?: unknown }).longitude),
            }
          : {
              label: typeof locationQuery === 'string' && locationQuery.trim() ? locationQuery.trim() : null,
            };

      const itineraryInput = JSON.stringify({
        transcript: transcription.transcript,
        location_context: locationContext,
      });
      const parsedActivities = await callASIOneParser(itineraryInput, locationContext);
      const tripTitle =
        typeof title === 'string' && title.trim()
          ? title.trim()
          : `${transcription.transcript.trim().slice(0, 48) || 'Voice'} itinerary`;

      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          user_id: userId,
          title: tripTitle,
          is_public: false,
          total_budget: 0,
          total_distance_miles: null,
          total_drive_time_minutes: null,
          total_gas_cost: null,
        })
        .select('id, title, is_public, created_at')
        .single();

      if (tripError || !trip) {
        throw tripError ?? new Error('Failed to create trip shell.');
      }

      let totalCalculatedCost = 0;
      for (const activity of parsedActivities) {
        totalCalculatedCost += activity.cost;

        const { error: activityError } = await supabase
          .from('activities')
          .insert({
            trip_id: trip.id,
            title: activity.title,
            description: activity.description ?? null,
            location_name: activity.location_name,
            start_time: activity.start_time,
            end_time: activity.end_time,
            tags: activity.tags,
            cost: activity.cost,
            rating: activity.rating ?? null,
            weather_snapshot: activity.weather_snapshot ?? null,
            venue_hours: activity.venue_hours ?? null,
            location_coords: `POINT(${activity.lng} ${activity.lat})`,
          });

        if (activityError) {
          throw activityError;
        }

        await schedulePokeReminder(userId, activity.title, activity.start_time);
      }

      const { error: tripUpdateError } = await supabase
        .from('trips')
        .update({
          total_budget: totalCalculatedCost,
          total_distance_miles: 5.8,
          total_drive_time_minutes: 22,
          is_public: true,
        })
        .eq('id', trip.id);

      if (tripUpdateError) {
        throw tripUpdateError;
      }

      await invalidateTripTimeline(trip.id);
      await invalidateMainFeedCache();

      res.status(201).json({
        transcript: transcription.transcript,
        trip,
        activities: parsedActivities,
        activitiesCreated: parsedActivities.length,
      });
    } catch (error) {
      console.error('Error generating voice itinerary:', error);
      res.status(500).json({ error: 'Failed to generate itinerary from voice.' });
    }
  });

  router.get('/feed', async (_req, res) => {
    try {
      const cachedFeed = await getCachedMainFeed<{ trips: unknown[] }>();
      if (cachedFeed) {
        res.status(200).json(cachedFeed);
        return;
      }

      const { data: publicTrips, error } = await supabase
        .from('trips')
        .select(`
          id, title, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost, created_at,
          user:users (id, username, avatar_url),
          activities (id, title, description, location_name, cost, start_time, end_time, tags, location_coords),
          trip_media (id, s3_url, activity_id, media_type, caption, created_at)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const routePreviewByTrip = await loadRoutePreviewPointsByTripId((publicTrips ?? []).map((trip) => trip.id));

      const tripsWithCounts = await Promise.all(
        (publicTrips ?? []).map(async (trip) => ({
          ...trip,
          route_preview_points: routePreviewByTrip.get(trip.id) ?? buildRoutePreviewPoints(trip.activities as Array<{ id: number; title: string; location_coords?: unknown }> | null | undefined),
          engagement: await getTripEngagementCounts(trip.id),
        }))
      );

      const payload = { trips: tripsWithCounts };
      await setCachedMainFeed(payload);

      res.status(200).json(payload);
    } catch (error) {
      console.error('Error fetching dashboard discover feeds:', error);
      res.status(500).json({ error: 'Failed to retrieve feed arrays.' });
    }
  });

  router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: trips, error } = await supabase
        .from('trips')
        .select(`
          id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost,
          activities (id, title, description, location_name, cost, start_time, end_time, tags, location_coords),
          trip_media (id, s3_url, activity_id, media_type, caption, created_at)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const routePreviewByTrip = await loadRoutePreviewPointsByTripId((trips ?? []).map((trip) => trip.id));

      const tripsWithCounts = await Promise.all(
        (trips ?? []).map(async (trip) => ({
          ...trip,
          route_preview_points: routePreviewByTrip.get(trip.id) ?? buildRoutePreviewPoints(trip.activities as Array<{ id: number; title: string; location_coords?: unknown }> | null | undefined),
          engagement: await getTripEngagementCounts(trip.id),
        }))
      );

      res.status(200).json({ trips: tripsWithCounts });
    } catch (error) {
      console.error('Error fetching current user trips:', error);
      res.status(500).json({ error: 'Failed to retrieve your trips.' });
    }
  });

  router.get('/:id/timeline', async (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      const timeline = await getTripTimeline(id);

      if (!timeline) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }

      res.status(200).json(timeline);
    } catch (error) {
      console.error('Error fetching trip timeline:', error);
      res.status(500).json({ error: 'Failed to retrieve trip timeline.' });
    }
  });

  router.post('/:id/activities', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tripId = String(req.params.id ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await ensureTripOwnership(tripId, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this trip.' });
        return;
      }

      const payload = getActivityPayload(req.body ?? {});
      if (!payload.title || typeof payload.title !== 'string') {
        res.status(400).json({ error: 'Activity title is required.' });
        return;
      }

      const { data, error } = await supabase
        .from('activities')
        .insert({
          trip_id: tripId,
          title: payload.title,
          description: payload.description ?? null,
          cost: payload.cost ?? 0,
          start_time: payload.start_time ?? null,
          end_time: payload.end_time ?? null,
          location_name: payload.location_name ?? null,
          tags: payload.tags ?? [],
          rating: payload.rating ?? null,
          venue_hours: payload.venue_hours ?? null,
          weather_snapshot: payload.weather_snapshot ?? null,
          location_coords: payload.location_coords ?? null,
        })
        .select('id, trip_id, title, description, cost, start_time, end_time, location_coords, location_name, rating, tags, venue_hours, weather_snapshot, created_at')
        .single<ActivityRow>();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to create trip activity.' });
        return;
      }

      await syncTripRollups(tripId);
      await invalidateTripTimeline(tripId);
      await invalidateMainFeedCache();

      res.status(201).json({ activity: data });
    } catch (error) {
      console.error('Error creating trip activity:', error);
      res.status(500).json({ error: 'Failed to create trip activity.' });
    }
  });

  // Upload a photo for an activity: base64 → Supabase Storage → trip_media row.
  router.post('/activities/:activityId/media', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activityId = String(req.params.activityId ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { base64, mediaType, caption } = req.body ?? {};
      if (!base64 || typeof base64 !== 'string') {
        res.status(400).json({ error: 'A base64 image payload is required.' });
        return;
      }

      const { data: activity, error: fetchError } = await supabase
        .from('activities')
        .select('id, trip_id')
        .eq('id', activityId)
        .maybeSingle<{ id: number; trip_id: number }>();

      if (fetchError) throw fetchError;
      if (!activity) {
        res.status(404).json({ error: 'Activity not found.' });
        return;
      }

      const ownership = await ensureTripOwnership(activity.trip_id, userId);
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this activity.' });
        return;
      }

      const uploaded = await uploadActivityImage(
        activity.trip_id,
        activity.id,
        base64,
        typeof mediaType === 'string' ? mediaType : 'image/jpeg'
      );

      const { data: media, error: insertError } = await supabase
        .from('trip_media')
        .insert({
          trip_id: activity.trip_id,
          activity_id: activity.id,
          s3_url: uploaded.publicUrl,
          media_type: uploaded.contentType.startsWith('video/') ? 'video' : 'image',
          caption: typeof caption === 'string' ? caption : null,
        })
        .select('id, trip_id, activity_id, s3_url, media_type, caption, created_at')
        .single();

      if (insertError || !media) {
        res.status(500).json({ error: 'Failed to save media record.' });
        return;
      }

      await invalidateTripTimeline(activity.trip_id);
      await invalidateMainFeedCache();

      res.status(201).json({ media });
    } catch (error) {
      console.error('Error uploading activity media:', error);
      res.status(500).json({ error: 'Failed to upload activity media.' });
    }
  });

  router.patch('/activities/:activityId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activityId = String(req.params.activityId ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: existingActivity, error: fetchError } = await supabase
        .from('activities')
        .select('id, trip_id, trip:trips!inner (id, user_id)')
        .eq('id', activityId)
        .maybeSingle<{ id: number; trip_id: number; trip?: { id: number; user_id: string } | null }>();

      if (fetchError) {
        throw fetchError;
      }

      if (!existingActivity) {
        res.status(404).json({ error: 'Activity not found.' });
        return;
      }

      const ownership = await ensureTripOwnership(existingActivity.trip_id, userId);
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this activity.' });
        return;
      }

      const updatePayload = getActivityPayload(req.body ?? {});
      if (!Object.keys(updatePayload).length) {
        res.status(400).json({ error: 'No valid activity fields were provided.' });
        return;
      }

      // Only write the fields that were actually provided — spreading a forced
      // `location_coords: ... ?? null` here would wipe coordinates on any partial
      // update (e.g. setting just a rating), breaking the map on reload.
      const { data, error } = await supabase
        .from('activities')
        .update(updatePayload)
        .eq('id', activityId)
        .select('id, trip_id, title, description, cost, start_time, end_time, location_coords, location_name, rating, tags, venue_hours, weather_snapshot, created_at')
        .single<ActivityRow>();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to update activity.' });
        return;
      }

      await syncTripRollups(existingActivity.trip_id);
      await invalidateTripTimeline(existingActivity.trip_id);
      await invalidateMainFeedCache();

      res.status(200).json({ activity: data });
    } catch (error) {
      console.error('Error updating trip activity:', error);
      res.status(500).json({ error: 'Failed to update activity.' });
    }
  });

  router.delete('/activities/:activityId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activityId = String(req.params.activityId ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: existingActivity, error: fetchError } = await supabase
        .from('activities')
        .select('id, trip_id')
        .eq('id', activityId)
        .maybeSingle<{ id: number; trip_id: number }>();

      if (fetchError) {
        throw fetchError;
      }

      if (!existingActivity) {
        res.status(404).json({ error: 'Activity not found.' });
        return;
      }

      const ownership = await ensureTripOwnership(existingActivity.trip_id, userId);
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this activity.' });
        return;
      }

      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId);

      if (error) {
        throw error;
      }

      await syncTripRollups(existingActivity.trip_id);
      await invalidateTripTimeline(existingActivity.trip_id);
      await invalidateMainFeedCache();

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting trip activity:', error);
      res.status(500).json({ error: 'Failed to delete activity.' });
    }
  });

  router.post('/:id/publish', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await ensureTripOwnership(id, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this trip.' });
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .update({ is_public: true })
        .eq('id', id)
        .select('id, title, is_public')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to publish trip.' });
        return;
      }

      await invalidateMainFeedCache();

      res.status(200).json({ trip: data });
    } catch (error) {
      console.error('Error publishing trip:', error);
      res.status(500).json({ error: 'Failed to publish trip.' });
    }
  });

  router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await ensureTripOwnership(id, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this trip.' });
        return;
      }

      const updatePayload: Record<string, unknown> = {};
      for (const field of ['title', 'is_public', 'total_budget', 'total_distance_miles', 'total_drive_time_minutes', 'total_gas_cost'] as const) {
        if (req.body[field] !== undefined) {
          updatePayload[field] = req.body[field];
        }
      }

      if (!Object.keys(updatePayload).length) {
        res.status(400).json({ error: 'No valid trip fields were provided.' });
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .update(updatePayload)
        .eq('id', id)
        .select('id, title, is_public, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost, created_at')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to update trip.' });
        return;
      }

      await invalidateTripTimeline(id);
      await invalidateMainFeedCache();

      res.status(200).json({ trip: data });
    } catch (error) {
      console.error('Error updating trip:', error);
      res.status(500).json({ error: 'Failed to update trip.' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const id = String(req.params.id ?? '');

      const { data: trip, error } = await supabase
        .from('trips')
        .select(`
          id, title, is_public, created_at,
          total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost,
          user:users (id, username, avatar_url),
          activities (
            id, title, description, location_name, start_time, end_time, cost, tags, location_coords, rating, venue_hours, weather_snapshot
          )
        `)
        .eq('id', id)
        .single();

      if (error || !trip) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }

      const engagement = await getTripEngagementCounts(trip.id);

      res.status(200).json({ trip: { ...trip, engagement } });
    } catch (error) {
      console.error('Error fetching trip detail:', error);
      res.status(500).json({ error: 'Failed to retrieve trip detail.' });
    }
  });

  return router;
}
