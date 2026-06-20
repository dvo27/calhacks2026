// backend/src/types/schema.ts
export interface ActivityCoordinates {
  lng: number;
  lat: number;
}

export interface MapTrailActivity {
  activity_title: string;
  location_name: string;
  lng: number;
  lat: number;
  photos: string[];
}

export interface TripFeedPayload {
  trip_id: number;
  title: string;
  username: string;
  complete_itinerary_map_trail: MapTrailActivity[];
}