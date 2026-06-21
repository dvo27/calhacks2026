import { supabase } from './supabase'; // your existing Supabase client setup

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5001').trim().replace(/\/+$/, '');

async function getAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const headers = new Headers(options.headers ?? {});

  headers.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(authHeader)) {
    headers.set(key, value);
  }

  const res = await fetch(new URL(path, `${API_BASE_URL}/`).toString(), {
    ...options,
    headers,
  });

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
  limit = 20
) {
  return apiFetch<PlaceSuggestionsResponse>('/api/trips/place-suggestions', {
    method: 'POST',
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

export function getTripTimeline(tripId: number | string) {
  return apiFetch<any>(`/api/trips/${tripId}/timeline`, { method: 'GET' });
}

export function publishTrip(tripId: number | string) {
  return apiFetch<any>(`/api/trips/${tripId}/publish`, { method: 'POST' });
}
