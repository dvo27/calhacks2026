import type { Queue } from 'bullmq';
import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ensureTripOwnership, getTripEngagementCounts } from '../services/metrics.js';
import { getTripTimeline, invalidateTripTimeline } from '../services/timeline.js';
import { suggestPlacesForLocation, type NearbyPlace } from '../services/places.js';
import { uploadActivityImage } from '../services/storage.js';
import { callASIOneRecommendations } from '../services/integrations.js';

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

type RecommendationItem = {
  kind: 'place' | 'trip';
  title: string;
  reason: string;
  category?: string | null;
  display_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  price_tier?: number | null;
  tags?: string[];
  stops?: Array<{
    title: string;
    display_address?: string | null;
    lat: number;
    lng: number;
  }>;
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

function formatPlaceForPrompt(place: NearbyPlace, index: number) {
  const parts = [
    `${index + 1}. ${place.name}`,
    place.category,
    place.subcategory ? `(${place.subcategory})` : null,
    place.displayAddress ? `— ${place.displayAddress}` : null,
    `distance=${Math.round(place.distanceMeters)}m`,
    place.priceTier !== null ? `price=${place.priceTier}` : null,
    place.tags.length ? `tags=${place.tags.slice(0, 4).join(', ')}` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

function fallbackRecommendations(places: NearbyPlace[], limit: number): RecommendationItem[] {
  const placeRecommendations: RecommendationItem[] = places.slice(0, Math.max(1, limit - 1)).map((place) => ({
    kind: 'place' as const,
    title: place.name,
    reason: `${place.category} near you${place.displayAddress ? ` · ${place.displayAddress}` : ''}`,
    category: place.category,
    display_address: place.displayAddress,
    lat: place.lat,
    lng: place.lng,
    price_tier: place.priceTier,
    tags: place.tags.slice(0, 6),
  }));

  const topTripStops = places.slice(0, 3);
  if (topTripStops.length) {
    const firstStop = topTripStops[0]!;
    placeRecommendations.unshift({
      kind: 'trip',
      title: `${firstStop.category === 'food' ? 'Food crawl' : 'Best of the area'}`,
      reason: 'A compact route built from the strongest nearby results.',
      stops: topTripStops.map((place) => ({
        title: place.name,
        display_address: place.displayAddress,
        lat: place.lat,
        lng: place.lng,
      })),
    });
  }

  return placeRecommendations.slice(0, limit);
}

function normalizeRecommendations(aiRecommendations: RecommendationItem[] | undefined, places: NearbyPlace[], limit: number) {
  const fallback = fallbackRecommendations(places, limit);
  if (!aiRecommendations?.length) {
    return fallback;
  }

  const normalized = aiRecommendations
    .map((item) => ({
      kind: item.kind,
      title: item.title?.trim(),
      reason: item.reason?.trim(),
      category: item.category ?? null,
      display_address: item.display_address ?? null,
      lat: typeof item.lat === 'number' ? item.lat : null,
      lng: typeof item.lng === 'number' ? item.lng : null,
      price_tier: typeof item.price_tier === 'number' ? item.price_tier : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0) : [],
      stops: Array.isArray(item.stops)
        ? item.stops
            .filter((stop) => typeof stop.title === 'string' && typeof stop.lat === 'number' && typeof stop.lng === 'number')
            .map((stop) => ({
              title: stop.title,
              display_address: stop.display_address ?? null,
              lat: stop.lat,
              lng: stop.lng,
            }))
        : undefined,
    }))
    .filter((item) => item.title && item.reason)
    .slice(0, limit);

  if (!normalized.length) {
    return fallback;
  }

  return normalized;
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

  router.post('/place-suggestions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

  router.post('/recommendations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { locationQuery, searchQuery, originCoords, radiusMeters, limit } = req.body ?? {};

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!locationQuery || typeof locationQuery !== 'string') {
        res.status(400).json({ error: 'locationQuery is required to fetch recommendations.' });
        return;
      }

      const parsedRadius = Number(radiusMeters);
      const parsedLimit = Number(limit);
      const recommendationLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 6;
      const searchText = typeof searchQuery === 'string' ? searchQuery.trim() : '';

      const nearby = await suggestPlacesForLocation(
        locationQuery,
        searchText,
        originCoords && typeof originCoords === 'object' ? originCoords : undefined,
        Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 5000,
        Math.max(recommendationLimit * 2, 10)
      );

      const prompt = [
        `User location query: ${locationQuery.trim()}`,
        `Search intent: ${searchText || 'general recommendations'}`,
        `Origin: ${nearby.origin.displayName} (${nearby.origin.lat}, ${nearby.origin.lng})`,
        `Nearby candidate places:`,
        ...nearby.places.slice(0, 12).map((place, index) => formatPlaceForPrompt(place, index)),
        '',
        'Return a mix of place recommendations and trip ideas. Prefer items that are nearby, match the search intent, and feel like they belong together.',
        'For trip ideas, group 2-4 places into an ordered route with the best sequence first.',
      ].join('\n');

      const aiResponse = await callASIOneRecommendations(prompt);
      const recommendations = normalizeRecommendations(aiResponse?.recommendations ?? aiResponse?.data, nearby.places, recommendationLimit);

      res.status(200).json({
        headline: aiResponse?.headline ?? `Recommended near ${nearby.origin.displayName}`,
        origin: nearby.origin,
        query: searchText,
        recommendations,
      });
    } catch (error) {
      console.error('Error building recommendations:', error);
      res.status(500).json({ error: 'Failed to build recommendations.' });
    }
  });

  router.get('/feed', async (_req, res) => {
    try {
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

      res.status(200).json({ trips: tripsWithCounts });
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
