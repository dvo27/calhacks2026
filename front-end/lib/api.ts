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

// ---- Profile ----

export function getMyProfile() {
  return apiFetch<any>('/api/profile/me');
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

export interface ActivityMedia {
  id: number;
  url: string;
  mediaType: string | null;
  caption: string | null;
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
  media: ActivityMedia[];
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
  description?: string | null;
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

export interface UploadMediaPayload {
  base64: string;
  mediaType?: string;
  caption?: string;
}

export interface ActivityMediaResponse {
  media: {
    id: number;
    trip_id: number;
    activity_id: number;
    s3_url: string;
    media_type: string | null;
    caption: string | null;
    created_at: string;
  };
}

export function uploadActivityMedia(activityId: number | string, payload: UploadMediaPayload) {
  return apiFetch<ActivityMediaResponse>(`/api/trips/activities/${activityId}/media`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface TripSummary {
  id: number;
  title: string;
  is_public?: boolean;
  created_at: string;
  total_budget: number | string | null;
  total_distance_miles: number | string | null;
  total_drive_time_minutes: number | null;
  total_gas_cost: number | string | null;
  user?: { id: string; username: string | null; avatar_url: string | null } | null;
  activities?: Array<{ id: number; title?: string; description?: string | null; location_coords?: unknown }> | null;
  route_preview_points?: Array<{ id: number; title: string; latitude: number; longitude: number }> | null;
  trip_media?: Array<{ id?: number; s3_url: string; activity_id?: number | null; media_type?: string | null; caption?: string | null; created_at: string }> | null;
  engagement?: { likes?: number; comments?: number; saves?: number; copies?: number } | null;
}

export interface TripsResponse {
  trips: TripSummary[];
}

export function getFeed() {
  return apiFetch<TripsResponse>('/api/trips/feed', { method: 'GET' });
}

export function getMyTrips() {
  return apiFetch<TripsResponse>('/api/trips/mine', { method: 'GET' });
}

// ---- Explore ----

export interface ExploreTrip {
  id: number;
  title: string;
  is_public: boolean;
  created_at: string;
  total_budget: number | null;
  total_distance_miles: number | null;
  total_drive_time_minutes: number | null;
  total_gas_cost: number | null;
  user: { id: string; username: string | null; avatar_url: string | null } | null;
  activities: Array<{ id: number; title: string; description?: string | null; location_coords?: unknown; tags?: string[] | null }>;
  engagement: { likes: number; comments: number; shares: number };
}

export function getExploreFeed() {
  return apiFetch<{ trips: ExploreTrip[] }>('/api/trips/feed', { method: 'GET' });
}

// ---- Social: likes ----

export interface Engagement {
  likes: number;
  comments: number;
  saves: number;
  copies: number;
}

export function likeTrip(tripId: number | string) {
  return apiFetch<{ liked: boolean; engagement: Engagement }>(`/api/trips/${tripId}/like`, { method: 'POST' });
}

export function unlikeTrip(tripId: number | string) {
  return apiFetch<{ liked: boolean; engagement: Engagement }>(`/api/trips/${tripId}/like`, { method: 'DELETE' });
}

export function getLikes(tripId: number | string) {
  return apiFetch<{ likes: Array<{ id: number; user: { id: string; username: string | null } | null }>; engagement: Engagement }>(`/api/trips/${tripId}/likes`);
}

// ---- Social: comments ----

export interface Comment {
  id: number;
  user_id: string;
  trip_id: number;
  comment_text: string;
  created_at: string;
  user?: { id: string; username: string | null } | null;
}

export function getComments(tripId: number | string) {
  return apiFetch<{ comments: Comment[] }>(`/api/trips/${tripId}/comments`);
}

export function addComment(tripId: number | string, text: string) {
  return apiFetch<{ comment: Comment; engagement: Engagement }>(`/api/trips/${tripId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ comment_text: text }),
  });
}

// ---- Social: share ----

export function recordShare(tripId: number | string, platform = 'imessage') {
  return apiFetch<{ share: { id: number }; engagement: Engagement }>(`/api/trips/${tripId}/share`, {
    method: 'POST',
    body: JSON.stringify({ platform }),
  });
}

// ---- Social: follow ----

export function followUser(userId: string) {
  return apiFetch<{ following: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' });
}

export function unfollowUser(userId: string) {
  return apiFetch<{ following: boolean }>(`/api/users/${userId}/follow`, { method: 'DELETE' });
}

// ---- Social: user search ----

export interface PublicUser {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

export function searchUsers(query: string) {
  return apiFetch<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);
}

// ---- Activity feed ----

export interface ActivityEvent {
  type: 'like' | 'comment' | 'share' | 'follow';
  created_at: string;
  actor?: { id: string; username: string | null } | null;
  trip?: { id: number; title: string } | null;
  comment_text?: string;
  platform?: string;
}

export function getActivityFeed() {
  return apiFetch<{ events: ActivityEvent[] }>('/api/activity');
}
