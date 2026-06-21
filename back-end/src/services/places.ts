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
  priceTier: number | null;
  displayAddress: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  tags: string[];
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  source: 'foursquare' | 'fallback';
};

const DEFAULT_LOCATION_QUERY = 'Los Angeles, CA';
const DEFAULT_ORIGIN: OriginLocation = {
  displayName: 'Los Angeles, CA',
  lat: 34.0522,
  lng: -118.2437,
};

const FOURSQUARE_BASE_URL = (getBackendEnv('FOURSQUARE_BASE_URL') ?? 'https://places-api.foursquare.com').trim().replace(/\/+$/, '');
const FOURSQUARE_KEY = getBackendEnv('FOURSQUARE_API_KEY', 'FOURSQUARE_PLACES_API_KEY');
const FOURSQUARE_API_VERSION = getBackendEnv('FOURSQUARE_API_VERSION') ?? '2025-06-17';

// Free-tier Places API fields. Premium fields (price, hours, rating, popularity)
// return HTTP 429 / billing errors on the free plan, so they are intentionally omitted.
const FOURSQUARE_FIELDS = 'fsq_place_id,name,latitude,longitude,location,categories,distance,website,tel';

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

type FoursquareCategory = {
  id?: string;
  name?: string;
  short_name?: string;
  plural_name?: string;
};

type FoursquareLocation = {
  formatted_address?: string;
  name?: string;
  address?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country?: string;
  neighborhood?: string[];
};

type FoursquarePrice = {
  tier?: number;
  message?: string;
};

type FoursquarePlace = {
  fsq_place_id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  categories?: FoursquareCategory[];
  location?: FoursquareLocation;
  price?: FoursquarePrice | number | string;
  tel?: string;
  website?: string;
  hours?: unknown;
  chains?: unknown;
  popularity?: number;
  rating?: number;
};

type FoursquareSearchResponse = {
  results?: FoursquarePlace[];
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

function extractCoordinates(place: FoursquarePlace): { lat: number; lng: number } | null {
  const latitude = toFiniteNumber(place.latitude);
  const longitude = toFiniteNumber(place.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

function buildFallbackPlace(place: FallbackPlaceSeed, origin: OriginLocation): NearbyPlace {
  return {
    osmType: 'node',
    osmId: stableNumericId(`${place.name}:${place.lat}:${place.lng}`),
    name: place.name,
    category: place.category,
    subcategory: place.subcategory,
    priceTier: null,
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

function extractPriceTier(price: FoursquarePlace['price']): number | null {
  if (typeof price === 'number' && Number.isFinite(price)) {
    return price;
  }

  if (typeof price === 'string') {
    const parsed = Number(price);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (price && typeof price === 'object' && Number.isFinite(price.tier ?? NaN)) {
    return price.tier ?? null;
  }

  return null;
}

function classifyCategory(place: FoursquarePlace): string {
  const categories = place.categories ?? [];
  const labels = categories.flatMap((category) => [category.short_name, category.name, category.plural_name]).filter(
    (value): value is string => Boolean(value)
  );
  const normalized = labels.join(' ').toLowerCase();

  if (normalized.match(/\b(bar|nightclub|pub|cocktail|beer)\b/)) return 'nightlife';
  if (normalized.match(/\b(hotel|resort|inn|lodging)\b/)) return 'attractions';
  if (normalized.match(/\b(trail|hiking|park|nature|outdoor|garden|beach)\b/)) return 'attractions';
  if (normalized.match(/\b(shop|store|mall|market|boutique)\b/)) return 'shopping';
  if (normalized.match(/\b(cafe|coffee|restaurant|diner|bakery|food|tea|burger|pizza|barbecue)\b/)) return 'food';

  return 'attractions';
}

function buildDisplayAddress(place: FoursquarePlace) {
  const location = place.location;
  if (!location) return null;

  return (
    location.formatted_address
    ?? [location.address, location.locality, location.region, location.postcode].filter(Boolean).join(', ')
    ?? null
  );
}

function buildFoursquarePlace(place: FoursquarePlace, origin: OriginLocation): NearbyPlace | null {
  const coordinates = extractCoordinates(place);
  if (!coordinates) return null;

  const categories = (place.categories ?? [])
    .map((category) => category.short_name ?? category.name ?? category.plural_name)
    .filter((value): value is string => Boolean(value));
  const name = place.name ?? categories[0] ?? 'Place';
  const displayAddress = buildDisplayAddress(place);
  const category = classifyCategory(place);
  const priceTier = extractPriceTier(place.price);

  return {
    osmType: 'node',
    osmId: stableNumericId(place.fsq_place_id ?? `${name}:${coordinates.lat}:${coordinates.lng}`),
    name,
    category,
    subcategory: categories[0] ?? null,
    priceTier,
    displayAddress,
    lat: coordinates.lat,
    lng: coordinates.lng,
    distanceMeters: typeof place.distance === 'number' ? place.distance : haversineDistanceMeters(origin.lat, origin.lng, coordinates.lat, coordinates.lng),
    tags: [
      ...categories,
      displayAddress,
      priceTier !== null ? `price:${priceTier}` : null,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, 12),
    openingHours: place.hours ? JSON.stringify(place.hours) : null,
    website: place.website ?? null,
    phone: place.tel ?? null,
    source: 'foursquare',
  };
}

async function foursquareFetchJson<T>(path: string, params: Record<string, string | number | boolean | undefined>) {
  if (!FOURSQUARE_KEY) {
    throw new Error('FOURSQUARE_API_KEY is not configured.');
  }

  const url = new URL(path, `${FOURSQUARE_BASE_URL}/`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${FOURSQUARE_KEY}`,
      'X-Places-Api-Version': FOURSQUARE_API_VERSION,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Foursquare request failed with status ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function resolveOrigin(locationQuery: string, originCoords?: OriginCoords): Promise<OriginLocation> {
  if (
    originCoords &&
    Number.isFinite(originCoords.latitude) &&
    Number.isFinite(originCoords.longitude)
  ) {
    return {
      displayName: 'Current location',
      lat: originCoords.latitude,
      lng: originCoords.longitude,
    };
  }

  return {
    displayName: locationQuery || DEFAULT_LOCATION_QUERY,
    lat: DEFAULT_ORIGIN.lat,
    lng: DEFAULT_ORIGIN.lng,
  };
}

async function fetchFoursquarePlaces(origin: OriginLocation, radiusMeters: number, limit: number, searchQuery: string) {
  const query = searchQuery.trim() || 'place';
  const data = await foursquareFetchJson<FoursquareSearchResponse>('/places/search', {
    query,
    ll: `${origin.lat},${origin.lng}`,
    radius: Math.max(1, radiusMeters),
    limit,
    sort: 'DISTANCE',
    fields: FOURSQUARE_FIELDS,
  });

  const rawResults = data.results ?? [];
  return rawResults
    .map((place) => buildFoursquarePlace(place, origin))
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
  const topLimit = Math.max(limit, 1) * 2;

  let places: NearbyPlace[] = [];

  try {
    places = await fetchFoursquarePlaces(origin, radiusMeters, topLimit, trimmedSearchQuery);
  } catch (error) {
    console.warn(`Foursquare place lookup failed for "${locationQuery}", using fallback places:`, error);
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
