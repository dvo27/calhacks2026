import { supabase } from './supabase'; // your existing Supabase client setup
import Constants from 'expo-constants';

function getApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.linkingUri ?? '';
  const host = hostUri.replace(/^.*?:\/\//, '').replace(/\/.*$/, '');

  if (host.includes(':')) {
    return `http://${host.split(':')[0]}:5001`;
  }

  if (host) {
    return `http://${host}:5001`;
  }

  return 'http://localhost:5001';
}

const API_BASE_URL = getApiBaseUrl();

async function getAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const REQUEST_TIMEOUT_MS = 15000;

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const headers = new Headers(options.headers ?? {});

  headers.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(authHeader)) {
    headers.set(key, value);
  }

  // Abort hung requests so the UI surfaces an error instead of spinning forever
  // (e.g. when the backend stalls on an unreachable Redis).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(new URL(path, `${API_BASE_URL}/`).toString(), {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Is the backend running and reachable?');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status} ${res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Trips ----

export interface CreateTripResponse {
  trip: { id: number; title: string; is_public: boolean; created_at: string };
}

export function createTrip(title: string) {
  return apiFetch<CreateTripResponse>('/api/trips', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export interface PlaceSuggestion {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string;
  category: string;
  subcategory: string | null;
  priceTier: number | null;
  displayAddress: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  tags: string[];
  openingHours: string | null;
  website: string | null;
  phone: string | null;
}

export interface PlaceSuggestionsResponse {
  origin: { displayName: string; lat: number; lng: number };
  radiusMeters: number;
  places: PlaceSuggestion[];
}

export function getPlaceSuggestions(
  locationQuery: string,
  searchQuery = '',
  originCoords?: { latitude: number; longitude: number },
  radiusMeters = 3000,
  limit = 20,
  signal?: AbortSignal
) {
  return apiFetch<PlaceSuggestionsResponse>('/api/trips/place-suggestions', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      locationQuery,
      searchQuery,
      originCoords,
      radiusMeters,
      limit,
    }),
  });
}

export interface CreateActivityPayload {
  title: string;
  description?: string;
  cost?: number;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  tags?: string[];
  location_coords?: { lat: number; lng: number };
}

export interface ActivityResponse {
  activity: {
    id: number;
    trip_id: number;
    title: string;
    cost: number;
    start_time: string | null;
    end_time: string | null;
    location_name: string | null;
    tags: string[] | null;
  };
}

export function addTripActivity(tripId: number | string, payload: CreateActivityPayload) {
  return apiFetch<ActivityResponse>(`/api/trips/${tripId}/activities`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteTripActivity(activityId: number | string) {
  return apiFetch<void>(`/api/trips/activities/${activityId}`, { method: 'DELETE' });
}

export interface TimelineActivity {
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
}

export interface TripTimelineResponse {
  trip: {
    id: number;
    title: string;
    isPublic: boolean;
    createdAt: string;
    totalBudget: number;
    totalDistanceMiles: number | null;
    totalDriveTimeMinutes: number | null;
    totalGasCost: number | null;
    user: { id: string; username: string | null; avatar_url: string | null } | null;
  };
  places: TimelineActivity[];
  summary: {
    stops: number;
    totalDurationMinutes: number;
    totalCost: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
  };
}

export function getTripTimeline(tripId: number | string) {
  return apiFetch<TripTimelineResponse>(`/api/trips/${tripId}/timeline`, { method: 'GET' });
}

export interface UpdateActivityPayload {
  title?: string;
  cost?: number;
  rating?: number | null;
  start_time?: string | null;
  end_time?: string | null;
}

export function updateActivity(activityId: number | string, payload: UpdateActivityPayload) {
  return apiFetch<ActivityResponse>(`/api/trips/activities/${activityId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export interface UpdateTripPayload {
  title?: string;
  is_public?: boolean;
  total_budget?: number;
  total_distance_miles?: number;
  total_drive_time_minutes?: number;
  total_gas_cost?: number;
}

export function updateTrip(tripId: number | string, payload: UpdateTripPayload) {
  return apiFetch<{ trip: { id: number; title: string; is_public: boolean } }>(`/api/trips/${tripId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function publishTrip(tripId: number | string) {
  return apiFetch<any>(`/api/trips/${tripId}/publish`, { method: 'POST' });
}
