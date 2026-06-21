type OriginLocation = {
  displayName: string;
  lat: number;
  lng: number;
};

export type NearbyPlace = {
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
  source: 'openstreetmap';
};

const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(2 * earthRadiusMeters * Math.asin(Math.sqrt(a)));
}

function buildAddress(tags: Record<string, string | undefined>) {
  const lineParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
  ].filter(Boolean);

  const cityStateParts = [
    tags['addr:city'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter(Boolean);

  const parts = [
    lineParts.length ? lineParts.join(' ') : null,
    cityStateParts.length ? cityStateParts.join(', ') : null,
  ].filter(Boolean);

  return parts.length ? parts.join(', ') : null;
}

function buildName(tags: Record<string, string | undefined>, fallback: string) {
  return tags.name ?? tags.brand ?? tags.operator ?? fallback;
}

function buildCategory(tags: Record<string, string | undefined>) {
  if (tags.amenity) return tags.amenity;
  if (tags.tourism) return tags.tourism;
  if (tags.leisure) return tags.leisure;
  if (tags.shop) return tags.shop;
  if (tags.historic) return tags.historic;
  if (tags.natural) return tags.natural;
  if (tags.building) return tags.building;
  return 'place';
}

async function geocodeLocation(locationQuery: string): Promise<OriginLocation> {
  const url = new URL(NOMINATIM_SEARCH_ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', locationQuery);

  const response = await fetch(url, {
    headers: {
      'user-agent': 'calhacks2026-backend/1.0',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim search failed with status ${response.status}`);
  }

  const data = (await response.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;

  const firstResult = data[0];
  const lat = firstResult?.lat ? Number(firstResult.lat) : null;
  const lng = firstResult?.lon ? Number(firstResult.lon) : null;

  if (!firstResult?.display_name || lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error(`No geocoding result found for "${locationQuery}"`);
  }

  return {
    displayName: firstResult.display_name,
    lat,
    lng,
  };
}

async function fetchNearbyPlaces(origin: OriginLocation, radiusMeters: number, limit: number): Promise<NearbyPlace[]> {
  const query = `
[out:json][timeout:25];
(
  node(around:${radiusMeters},${origin.lat},${origin.lng})["amenity"];
  node(around:${radiusMeters},${origin.lat},${origin.lng})["tourism"];
  node(around:${radiusMeters},${origin.lat},${origin.lng})["leisure"];
  node(around:${radiusMeters},${origin.lat},${origin.lng})["shop"];
  node(around:${radiusMeters},${origin.lat},${origin.lng})["historic"];
  node(around:${radiusMeters},${origin.lat},${origin.lng})["natural"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["amenity"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["tourism"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["leisure"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["shop"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["historic"];
  way(around:${radiusMeters},${origin.lat},${origin.lng})["natural"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["amenity"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["tourism"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["leisure"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["shop"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["historic"];
  relation(around:${radiusMeters},${origin.lat},${origin.lng})["natural"];
);
out center tags;
`;

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'calhacks2026-backend/1.0',
      accept: 'application/json',
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Overpass query failed with status ${response.status}: ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as {
    elements?: Array<{
      type: 'node' | 'way' | 'relation';
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: Record<string, string | undefined>;
    }>;
  };

  const places = (data.elements ?? [])
    .map((element) => {
      const tags = element.tags ?? {};
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;

      if (lat === undefined || lng === undefined) {
        return null;
      }

      const name = buildName(tags, `${buildCategory(tags)} ${element.id}`);
      return {
        osmType: element.type,
        osmId: element.id,
        name,
        category: buildCategory(tags),
        subcategory: tags.tourism ?? tags.amenity ?? tags.leisure ?? tags.shop ?? tags.historic ?? tags.natural ?? null,
        displayAddress: buildAddress(tags),
        lat,
        lng,
        distanceMeters: haversineDistanceMeters(origin.lat, origin.lng, lat, lng),
        tags: Object.entries(tags)
          .filter(([, value]) => typeof value === 'string')
          .slice(0, 12)
          .map(([key, value]) => `${key}=${value}`),
        openingHours: tags.opening_hours ?? null,
        website: tags.website ?? tags['contact:website'] ?? null,
        phone: tags.phone ?? tags['contact:phone'] ?? null,
        source: 'openstreetmap' as const,
      } satisfies NearbyPlace;
    })
    .filter((place): place is NearbyPlace => Boolean(place))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, Math.max(limit, 1));

  return places;
}

export async function suggestPlacesForLocation(locationQuery: string, radiusMeters = 3000, limit = 20) {
  const origin = await geocodeLocation(locationQuery);
  const places = await fetchNearbyPlaces(origin, radiusMeters, limit);

  return {
    origin,
    radiusMeters,
    places,
  };
}
