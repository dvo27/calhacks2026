import { getBackendEnv } from '../config/env.js';

type OriginLocation = {
  displayName: string;
  lat: number;
  lng: number;
};

type OriginCoords = {
  latitude: number;
  longitude: number;
};

type FallbackPlaceSeed = {
  name: string;
  category: string;
  subcategory: string | null;
  displayAddress: string | null;
  lat: number;
  lng: number;
  tags: string[];
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
  source: 'azure-maps' | 'fallback';
};

const DEFAULT_LOCATION_QUERY = 'Los Angeles, CA';
const DEFAULT_ORIGIN: OriginLocation = {
  displayName: 'Los Angeles, CA',
  lat: 34.0522,
  lng: -118.2437,
};

const AZURE_MAPS_BASE_URL = (getBackendEnv('AZURE_MAPS_BASE_URL') ?? 'https://atlas.microsoft.com').trim().replace(/\/+$/, '');
const AZURE_MAPS_KEY = getBackendEnv('AZURE_MAPS_KEY', 'AZURE_MAPS_SUBSCRIPTION_KEY');
const AZURE_MAPS_API_VERSION = getBackendEnv('AZURE_MAPS_API_VERSION') ?? '2026-01-01';
const AZURE_MAPS_LANGUAGE = getBackendEnv('AZURE_MAPS_LANGUAGE') ?? 'en-US';

const FALLBACK_PLACES: FallbackPlaceSeed[] = [
  {
    name: 'The Broad',
    category: 'attractions',
    subcategory: 'museum',
    displayAddress: 'DTLA · 221 S Grand Ave',
    lat: 34.0544,
    lng: -118.2509,
    tags: ['art', 'museum'],
  },
  {
    name: 'Grand Central Market',
    category: 'food',
    subcategory: 'market',
    displayAddress: 'DTLA · 317 S Broadway',
    lat: 34.0506,
    lng: -118.2482,
    tags: ['food', 'market'],
  },
  {
    name: 'LACMA',
    category: 'attractions',
    subcategory: 'museum',
    displayAddress: 'Mid-Wilshire · 5905 Wilshire Blvd',
    lat: 34.0638,
    lng: -118.3593,
    tags: ['art', 'museum'],
  },
  {
    name: 'The Grove',
    category: 'shopping',
    subcategory: 'mall',
    displayAddress: 'Fairfax · 189 The Grove Dr',
    lat: 34.0722,
    lng: -118.3570,
    tags: ['shopping', 'retail'],
  },
  {
    name: 'Griffith Observatory',
    category: 'attractions',
    subcategory: 'viewpoint',
    displayAddress: 'Los Feliz · 2800 E Observatory Rd',
    lat: 34.1184,
    lng: -118.3004,
    tags: ['views', 'hiking'],
  },
  {
    name: 'Sqirl',
    category: 'food',
    subcategory: 'cafe',
    displayAddress: 'Silver Lake · 720 N Virgil Ave',
    lat: 34.0866,
    lng: -118.2900,
    tags: ['coffee', 'brunch'],
  },
  {
    name: 'Erewhon Market',
    category: 'food',
    subcategory: 'grocery',
    displayAddress: 'Silver Lake · 711 Sunset Blvd',
    lat: 34.0778,
    lng: -118.2754,
    tags: ['grocery', 'market'],
  },
  {
    name: 'The Abbey',
    category: 'nightlife',
    subcategory: 'bar',
    displayAddress: 'WeHo · 692 N Robertson Blvd',
    lat: 34.0840,
    lng: -118.3827,
    tags: ['bar', 'nightlife'],
  },
  {
    name: 'Runyon Canyon',
    category: 'attractions',
    subcategory: 'trail',
    displayAddress: 'Hollywood · 2000 N Fuller Ave',
    lat: 34.1059,
    lng: -118.3498,
    tags: ['hike', 'outdoors'],
  },
  {
    name: 'Melrose Trading Post',
    category: 'shopping',
    subcategory: 'market',
    displayAddress: 'Fairfax · 7850 Melrose Ave',
    lat: 34.0842,
    lng: -118.3538,
    tags: ['market', 'vintage'],
  },
];

const SEARCH_STOP_WORDS = new Set([
  'near',
  'me',
  'in',
  'around',
  'the',
  'a',
  'an',
  'for',
  'of',
  'to',
  'my',
  'best',
  'good',
]);

type AzureMapsGeometry = {
  coordinates?: number[];
};

type AzureMapsAddress = {
  formattedAddress?: string;
  freeformAddress?: string;
};

type AzureMapsPoi = {
  name?: string;
  categories?: string[];
  phone?: string;
  url?: string;
};

type AzureMapsGeocodeFeature = {
  geometry?: AzureMapsGeometry;
  properties?: {
    address?: AzureMapsAddress;
  };
};

type AzureMapsSearchResult = {
  geometry?: AzureMapsGeometry;
  position?: { lat?: number; lon?: number };
  poi?: AzureMapsPoi;
  address?: AzureMapsAddress;
  dist?: number;
  entityType?: string;
  type?: string;
  openingHours?: unknown;
};

type AzureMapsGeocodeResponse = {
  features?: AzureMapsGeocodeFeature[];
};

type AzureMapsNearbyResponse = {
  results?: AzureMapsSearchResult[];
  features?: AzureMapsSearchResult[];
};

type AzureMapsAutocompleteFeature = {
  geometry?: AzureMapsGeometry;
  properties?: {
    name?: string;
    type?: string;
    typeGroup?: string;
    address?: AzureMapsAddress;
    poi?: AzureMapsPoi;
  };
};

type AzureMapsAutocompleteResponse = {
  features?: AzureMapsAutocompleteFeature[];
};

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
  const lineParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
  const cityStateParts = [tags['addr:city'], tags['addr:state'], tags['addr:postcode']].filter(Boolean);

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

function normalizeSearchTerms(searchQuery: string) {
  return searchQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term));
}

function scorePlace(place: NearbyPlace, searchTerms: string[]) {
  if (!searchTerms.length) {
    return 0;
  }

  const haystack = [place.name, place.category, place.subcategory ?? '', place.displayAddress ?? '', ...place.tags]
    .join(' ')
    .toLowerCase();

  return searchTerms.reduce((score, term) => {
    if (place.name.toLowerCase().includes(term)) return score + 4;
    if (place.category.toLowerCase().includes(term)) return score + 3;
    if (place.subcategory?.toLowerCase().includes(term)) return score + 2;
    if (place.tags.some((tag) => tag.toLowerCase().includes(term))) return score + 1;
    if (haystack.includes(term)) return score + 1;
    return score;
  }, 0);
}

function scoreFallbackPlace(place: FallbackPlaceSeed, searchTerms: string[]) {
  if (!searchTerms.length) {
    return 0;
  }

  const haystack = [place.name, place.category, place.subcategory ?? '', place.displayAddress ?? '', ...place.tags]
    .join(' ')
    .toLowerCase();

  return searchTerms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}

function stableNumericId(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return hash >>> 0;
}

function extractCoordinates(value: AzureMapsGeometry | undefined): { lat: number; lng: number } | null {
  const coordinates = value?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const lng = toFiniteNumber(coordinates[0]);
  const lat = toFiniteNumber(coordinates[1]);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function radiusToBbox(origin: OriginLocation, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.2));

  return `${origin.lng - lngDelta},${origin.lat - latDelta},${origin.lng + lngDelta},${origin.lat + latDelta}`;
}

function buildFallbackPlace(place: FallbackPlaceSeed, origin: OriginLocation): NearbyPlace {
  return {
    osmType: 'node',
    osmId: stableNumericId(`${place.name}:${place.lat}:${place.lng}`),
    name: place.name,
    category: place.category,
    subcategory: place.subcategory,
    displayAddress: place.displayAddress,
    lat: place.lat,
    lng: place.lng,
    distanceMeters: haversineDistanceMeters(origin.lat, origin.lng, place.lat, place.lng),
    tags: place.tags,
    openingHours: null,
    website: null,
    phone: null,
    source: 'fallback',
  };
}

function buildAzurePlace(result: AzureMapsSearchResult, origin: OriginLocation): NearbyPlace | null {
  const coordinates = extractCoordinates(result.geometry) ?? (
    typeof result.position?.lat === 'number' && typeof result.position?.lon === 'number'
      ? { lat: result.position.lat, lng: result.position.lon }
      : null
  );

  if (!coordinates) {
    return null;
  }

  const categories = result.poi?.categories ?? [];
  const name = result.poi?.name ?? result.address?.freeformAddress ?? result.entityType ?? 'Place';
  const displayAddress = result.address?.freeformAddress ?? null;
  const category = categories[0] ?? result.entityType ?? result.type ?? 'place';
  const subcategory = categories[1] ?? null;

  return {
    osmType: 'node',
    osmId: stableNumericId(`${name}:${coordinates.lat}:${coordinates.lng}`),
    name,
    category,
    subcategory,
    displayAddress,
    lat: coordinates.lat,
    lng: coordinates.lng,
    distanceMeters: typeof result.dist === 'number' ? result.dist : haversineDistanceMeters(origin.lat, origin.lng, coordinates.lat, coordinates.lng),
    tags: [
      ...categories,
      result.entityType,
      result.type,
      displayAddress,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, 12),
    openingHours: null,
    website: result.poi?.url ?? null,
    phone: result.poi?.phone ?? null,
    source: 'azure-maps',
  };
}

function buildAutocompletePlace(feature: AzureMapsAutocompleteFeature, origin: OriginLocation): NearbyPlace | null {
  const coordinates = extractCoordinates(feature.geometry);
  if (!coordinates) {
    return null;
  }

  const properties = feature.properties ?? {};
  const poi = properties.poi ?? {};
  const categories = poi.categories ?? [];
  const name = poi.name ?? properties.name ?? properties.address?.formattedAddress ?? 'Place';
  const category = categories[0] ?? properties.typeGroup ?? properties.type ?? 'place';
  const subcategory = categories[1] ?? null;
  const displayAddress = properties.address?.formattedAddress ?? properties.address?.freeformAddress ?? null;

  return {
    osmType: 'node',
    osmId: stableNumericId(`${name}:${coordinates.lat}:${coordinates.lng}`),
    name,
    category,
    subcategory,
    displayAddress,
    lat: coordinates.lat,
    lng: coordinates.lng,
    distanceMeters: haversineDistanceMeters(origin.lat, origin.lng, coordinates.lat, coordinates.lng),
    tags: [properties.typeGroup, properties.type, ...categories, displayAddress]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, 12),
    openingHours: null,
    website: poi.url ?? null,
    phone: poi.phone ?? null,
    source: 'azure-maps',
  };
}

async function azureMapsFetchJson<T>(path: string, params: Record<string, string | number | undefined>) {
  if (!AZURE_MAPS_KEY) {
    throw new Error('AZURE_MAPS_KEY is not configured.');
  }

  const url = new URL(path, `${AZURE_MAPS_BASE_URL}/`);
  url.searchParams.set('api-version', AZURE_MAPS_API_VERSION);
  url.searchParams.set('subscription-key', AZURE_MAPS_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'Accept-Language': AZURE_MAPS_LANGUAGE,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Azure Maps request failed with status ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function geocodeLocation(locationQuery: string): Promise<OriginLocation> {
  const data = await azureMapsFetchJson<AzureMapsGeocodeResponse>('/geocode', {
    query: locationQuery,
    top: 1,
    view: 'Auto',
  });

  const firstResult = data.features?.[0];
  const coordinates = extractCoordinates(firstResult?.geometry);
  const displayName = firstResult?.properties?.address?.formattedAddress
    ?? firstResult?.properties?.address?.freeformAddress
    ?? locationQuery;

  if (!coordinates) {
    throw new Error(`No geocoding result found for "${locationQuery}"`);
  }

  return {
    displayName,
    lat: coordinates.lat,
    lng: coordinates.lng,
  };
}

async function resolveOrigin(locationQuery: string, originCoords?: OriginCoords): Promise<OriginLocation> {
  if (
    originCoords &&
    Number.isFinite(originCoords.latitude) &&
    Number.isFinite(originCoords.longitude)
  ) {
    return {
      displayName: locationQuery,
      lat: originCoords.latitude,
      lng: originCoords.longitude,
    };
  }

  try {
    return await geocodeLocation(locationQuery);
  } catch (error) {
    console.warn(`Location geocoding failed for "${locationQuery}", using fallback origin:`, error);
    return DEFAULT_ORIGIN;
  }
}

async function fetchAzurePlaces(origin: OriginLocation, radiusMeters: number, limit: number, searchQuery: string) {
  const query = searchQuery.trim() || 'place';
  const data = await azureMapsFetchJson<AzureMapsAutocompleteResponse>('/geocode:autocomplete', {
    query,
    coordinates: `${origin.lng},${origin.lat}`,
    bbox: radiusToBbox(origin, radiusMeters),
    resultTypeGroups: 'Place',
    top: limit,
    view: 'Auto',
  });

  const rawResults = data.features ?? [];
  return rawResults
    .map((feature) => buildAutocompletePlace(feature, origin))
    .filter((place): place is NearbyPlace => Boolean(place));
}

function buildFallbackPlaces(origin: OriginLocation, radiusMeters: number, limit: number, searchQuery: string) {
  const searchTerms = normalizeSearchTerms(searchQuery);

  return FALLBACK_PLACES
    .map((place) => ({
      place: buildFallbackPlace(place, origin),
      score: scoreFallbackPlace(place, searchTerms),
    }))
    .filter(({ place }) => place.distanceMeters <= radiusMeters)
    .sort((left, right) => {
      if (searchTerms.length) {
        return right.score - left.score || left.place.distanceMeters - right.place.distanceMeters;
      }

      return left.place.distanceMeters - right.place.distanceMeters;
    })
    .map(({ place }) => place)
    .slice(0, Math.max(limit, 1));
}

export async function suggestPlacesForLocation(
  locationQuery: string,
  searchQuery = '',
  originCoords?: OriginCoords,
  radiusMeters = 3000,
  limit = 20
) {
  const origin = await resolveOrigin(locationQuery.trim() || DEFAULT_LOCATION_QUERY, originCoords);
  const trimmedSearchQuery = searchQuery.trim();
  const searchTerms = normalizeSearchTerms(searchQuery);
  const topLimit = Math.max(limit, 1) * 3;

  let places: NearbyPlace[] = [];

  try {
    places = await fetchAzurePlaces(origin, radiusMeters, topLimit, trimmedSearchQuery);
  } catch (error) {
    console.warn(`Azure Maps place lookup failed for "${locationQuery}", using fallback places:`, error);
    places = buildFallbackPlaces(origin, radiusMeters, topLimit, trimmedSearchQuery);
  }

  const rankedPlaces = searchTerms.length
    ? places
        .map((place) => ({ place, score: scorePlace(place, searchTerms) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.place.distanceMeters - right.place.distanceMeters)
        .map(({ place }) => place)
    : places;

  return {
    origin,
    radiusMeters,
    places: (rankedPlaces.length ? rankedPlaces : places).slice(0, Math.max(limit, 1)),
  };
}
