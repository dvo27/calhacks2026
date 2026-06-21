import { supabase } from './supabase.js';
import { getRedisJsonValue, setRedisJsonValue, deleteRedisKey } from './redis.js';

type TripActivityRow = {
  id: number;
  title: string;
  description: string | null;
  location_name: string | null;
  start_time: string | null;
  end_time: string | null;
  cost: number | string | null;
  tags: string[] | null;
  location_coords: unknown;
  rating: number | null;
  venue_hours: unknown;
  weather_snapshot: unknown;
  created_at: string;
};

type TripRow = {
  id: number;
  title: string;
  is_public: boolean;
  created_at: string;
  total_budget: number | string | null;
  total_distance_miles: number | string | null;
  total_drive_time_minutes: number | null;
  total_gas_cost: number | string | null;
  user?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  activities?: TripActivityRow[] | null;
};

export type ActivityMedia = {
  id: number;
  url: string;
  mediaType: string | null;
  caption: string | null;
};

export type TimelineActivity = {
  id: number;
  title: string;
  description: string | null;
  locationName: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  cost: number;
  tags: string[];
  rating: number | null;
  media: ActivityMedia[];
  venueHours: unknown;
  weatherSnapshot: unknown;
  createdAt: string;
};

type TripMediaRow = {
  id: number;
  trip_id: number;
  activity_id: number | null;
  s3_url: string;
  media_type: string | null;
  caption: string | null;
  created_at: string;
};

export type TimelineDay = {
  date: string;
  label: string;
  activities: TimelineActivity[];
};

export type TripTimeline = {
  trip: {
    id: number;
    title: string;
    isPublic: boolean;
    createdAt: string;
    totalBudget: number;
    totalDistanceMiles: number | null;
    totalDriveTimeMinutes: number | null;
    totalGasCost: number | null;
    user: TripRow['user'];
  };
  timeline: TimelineDay[];
  places: TimelineActivity[];
  summary: {
    stops: number;
    totalDurationMinutes: number;
    totalCost: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
  };
};

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'trip:timeline:';

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function parseLocationCoords(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    const maybeObject = value as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown; coordinates?: unknown };

    if (typeof maybeObject.latitude === 'number' && typeof maybeObject.longitude === 'number') {
      return { latitude: maybeObject.latitude, longitude: maybeObject.longitude };
    }

    if (typeof maybeObject.lat === 'number' && typeof maybeObject.lng === 'number') {
      return { latitude: maybeObject.lat, longitude: maybeObject.lng };
    }

    if (Array.isArray(maybeObject.coordinates) && maybeObject.coordinates.length >= 2) {
      const [longitude, latitude] = maybeObject.coordinates;

      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return { latitude, longitude };
      }
    }
  }

  if (typeof value === 'string') {
    const hexPoint = parsePostgisPointHex(value);
    if (hexPoint) {
      return hexPoint;
    }

    const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) {
      return {
        longitude: Number(match[1]),
        latitude: Number(match[2]),
      } satisfies { latitude: number; longitude: number };
    }
  }

  return null;
}

function parseTimeBucket(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDayLabel(date: Date, referenceDate: Date) {
  const sameDay = date.toDateString() === referenceDate.toDateString();
  if (sameDay) {
    return 'Today';
  }

  const nextDay = new Date(referenceDate);
  nextDay.setDate(nextDay.getDate() + 1);
  if (date.toDateString() === nextDay.toDateString()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function groupActivitiesByDay(activities: TimelineActivity[]) {
  const referenceDate = new Date();
  const grouped = new Map<string, TimelineDay>();

  for (const activity of activities) {
    const activityDate = parseTimeBucket(activity.startTime ?? activity.endTime ?? activity.createdAt);
    if (!activityDate) {
      const bucket = 'unscheduled';
      const existing = grouped.get(bucket);
      const nextActivities = existing ? [...existing.activities, activity] : [activity];
      grouped.set(bucket, {
        date: bucket,
        label: 'Unscheduled',
        activities: nextActivities,
      });
      continue;
    }

    const dateKey = activityDate.toISOString().slice(0, 10);
    const existing = grouped.get(dateKey);
    const nextActivities = existing ? [...existing.activities, activity] : [activity];
    grouped.set(dateKey, {
      date: dateKey,
      label: formatDayLabel(activityDate, referenceDate),
      activities: nextActivities,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function sortActivities(activities: TimelineActivity[]) {
  return [...activities].sort((left, right) => {
    const leftTime = left.startTime ?? left.endTime ?? left.createdAt;
    const rightTime = right.startTime ?? right.endTime ?? right.createdAt;
    return leftTime.localeCompare(rightTime);
  });
}

function normalizeActivities(
  activities: TripActivityRow[] | null | undefined,
  mediaByActivity: Map<number, ActivityMedia[]>
): TimelineActivity[] {
  return sortActivities(
    (activities ?? []).map((activity) => {
      const startDate = parseTimeBucket(activity.start_time);
      const endDate = parseTimeBucket(activity.end_time);
      const durationMinutes =
        startDate && endDate ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000)) : null;

      return {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        locationName: activity.location_name,
        coordinates: parseLocationCoords(activity.location_coords),
        startTime: activity.start_time,
        endTime: activity.end_time,
        durationMinutes,
        cost: toNumber(activity.cost),
        tags: activity.tags ?? [],
        rating: activity.rating,
        media: mediaByActivity.get(activity.id) ?? [],
        venueHours: activity.venue_hours,
        weatherSnapshot: activity.weather_snapshot,
        createdAt: activity.created_at,
      };
    })
  );
}

async function fetchMediaByActivity(tripId: number | string): Promise<Map<number, ActivityMedia[]>> {
  const map = new Map<number, ActivityMedia[]>();
  const { data, error } = await supabase
    .from('trip_media')
    .select('id, trip_id, activity_id, s3_url, media_type, caption, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load trip media:', error.message);
    return map;
  }

  for (const row of (data ?? []) as TripMediaRow[]) {
    if (row.activity_id === null) continue;
    const entry: ActivityMedia = {
      id: row.id,
      url: row.s3_url,
      mediaType: row.media_type,
      caption: row.caption,
    };
    const existing = map.get(row.activity_id);
    if (existing) existing.push(entry);
    else map.set(row.activity_id, [entry]);
  }

  return map;
}

export async function getTripTimeline(tripId: number | string): Promise<TripTimeline | null> {
  const cacheKey = `${CACHE_PREFIX}${tripId}`;
  const cachedTimeline = await getRedisJsonValue<TripTimeline>(cacheKey);
  if (cachedTimeline) {
    return cachedTimeline;
  }

  const { data, error } = await supabase
    .from('trips')
    .select(`
      id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost,
      user:users (id, username, avatar_url),
      activities (
        id, title, description, location_name, start_time, end_time, cost, tags, location_coords, rating, venue_hours, weather_snapshot, created_at
      )
    `)
    .eq('id', tripId)
    .maybeSingle<TripRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const mediaByActivity = await fetchMediaByActivity(tripId);
  const activities = normalizeActivities(data.activities, mediaByActivity);
  const totalDurationMinutes = activities.reduce((total, activity) => total + (activity.durationMinutes ?? 0), 0);
  const totalCost = activities.reduce((total, activity) => total + activity.cost, 0);
  const firstActivityAt = activities[0]?.startTime ?? activities[0]?.createdAt ?? null;
  const lastActivityAt = activities[activities.length - 1]?.endTime ?? activities[activities.length - 1]?.startTime ?? activities[activities.length - 1]?.createdAt ?? null;

  const timeline: TripTimeline = {
    trip: {
      id: data.id,
      title: data.title,
      isPublic: data.is_public,
      createdAt: data.created_at,
      totalBudget: toNumber(data.total_budget),
      totalDistanceMiles: toNullableNumber(data.total_distance_miles),
      totalDriveTimeMinutes: data.total_drive_time_minutes ?? null,
      totalGasCost: toNullableNumber(data.total_gas_cost),
      user: data.user ?? null,
    },
    timeline: groupActivitiesByDay(activities),
    places: activities,
    summary: {
      stops: activities.length,
      totalDurationMinutes,
      totalCost,
      firstActivityAt,
      lastActivityAt,
    },
  };

  await setRedisJsonValue(cacheKey, timeline, CACHE_TTL_SECONDS);

  return timeline;
}

export async function invalidateTripTimeline(tripId: number | string) {
  return deleteRedisKey(`${CACHE_PREFIX}${tripId}`);
}
