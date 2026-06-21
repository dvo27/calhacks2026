import { getBackendEnv } from '../config/env.js';
import { suggestPlacesForLocation } from './places.js';

export type ASIOneActivity = {
  title: string;
  location_name: string;
  lat: number;
  lng: number;
  start_time: string;
  end_time: string;
  tags: string[];
  cost: number;
  description?: string;
  venue_hours?: unknown;
  weather_snapshot?: unknown;
  rating?: number | null;
};

export type VoicePlaceIntent = {
  location_query: string | null;
  search_query: string;
  radius_meters: number;
  limit: number;
};

export type VoiceTranscriptWord = {
  word: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number;
};

export type VoiceTranscriptUtterance = {
  transcript: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number;
  words?: VoiceTranscriptWord[];
};

export type VoiceTranscriptionPayload = {
  transcript: string;
  language: string | null;
  durationSeconds: number | null;
  words: VoiceTranscriptWord[];
  utterances: VoiceTranscriptUtterance[];
  raw: DeepgramResponse;
};

type ASIOneResponseShape =
  | ASIOneActivity[]
  | {
      activities?: ASIOneActivity[];
      data?: ASIOneActivity[];
      itinerary?: {
        activities?: ASIOneActivity[];
        data?: ASIOneActivity[];
        stops?: ASIOneActivity[];
      };
      stops?: ASIOneActivity[];
      days?: Array<{
        activities?: ASIOneActivity[];
        stops?: ASIOneActivity[];
      }>;
    };

type ASIOneStructuredResponse = {
  itinerary_name?: string;
  activities?: ASIOneActivity[];
  data?: ASIOneActivity[];
  itinerary?: {
    activities?: ASIOneActivity[];
    data?: ASIOneActivity[];
    stops?: ASIOneActivity[];
  };
  stops?: ASIOneActivity[];
  days?: Array<{
    activities?: ASIOneActivity[];
    stops?: ASIOneActivity[];
  }>;
};

type DeepgramResponse = {
  metadata?: {
    request_id?: string;
    model_uuid?: string;
    duration?: number;
    language?: string;
    model_info?: {
      name?: string;
      version?: string;
    };
  };
  results?: {
    utterances?: VoiceTranscriptUtterance[];
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: VoiceTranscriptWord[];
      }>;
    }>;
  };
};

type VoiceItineraryPayload = {
  transcript?: string;
  language?: string | null;
  duration_seconds?: number | null;
  words?: VoiceTranscriptWord[];
  utterances?: VoiceTranscriptUtterance[];
  location_context?: {
    label?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  intent?: VoicePlaceIntent;
};

type VoiceFallbackContext = {
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function getAsiBaseUrl() {
  return getBackendEnv('ASI_BASE_URL');
}

function getAsiApiKey() {
  return getBackendEnv('ASI_ONE_API_KEY', 'ASI_API_KEY', 'ASI_SECRET_KEY');
}

function getAsiParsePath() {
  return getBackendEnv('ASI_PARSE_PATH') ?? '/chat/completions';
}

function getAsiTimeoutMs() {
  const timeout = Number(getBackendEnv('ASI_TIMEOUT_MS') ?? 15000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 15000;
}

function buildAsiEndpoint(path: string) {
  const baseUrl = getAsiBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, normalizedBaseUrl).toString();
}

function normalizeActivities(payload: ASIOneResponseShape): ASIOneActivity[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.activities)) {
    return payload.activities;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload.itinerary) {
    if (Array.isArray(payload.itinerary.activities)) {
      return payload.itinerary.activities;
    }

    if (Array.isArray(payload.itinerary.data)) {
      return payload.itinerary.data;
    }

    if (Array.isArray(payload.itinerary.stops)) {
      return payload.itinerary.stops;
    }
  }

  if (Array.isArray(payload.stops)) {
    return payload.stops;
  }

  if (Array.isArray(payload.days)) {
    const flattened: ASIOneActivity[] = [];
    for (const day of payload.days) {
      if (Array.isArray(day.activities)) {
        flattened.push(...day.activities);
      }
      if (Array.isArray(day.stops)) {
        flattened.push(...day.stops);
      }
    }
    if (flattened.length) {
      return flattened;
    }
  }

  return [];
}

function extractStructuredActivities(content: string): ASIOneActivity[] {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return [];
  }

  const parseOnce = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const parsed = parseOnce(trimmedContent);
  if (!parsed) {
    const firstBrace = trimmedContent.indexOf('{');
    const firstBracket = trimmedContent.indexOf('[');
    const startIndex =
      firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
    if (startIndex > 0) {
      const recovered = parseOnce(trimmedContent.slice(startIndex));
      if (recovered) {
        return normalizeActivities(recovered as ASIOneResponseShape);
      }
    }
    return [];
  }

  if (typeof parsed === 'string') {
    const nested = parseOnce(parsed);
    if (nested) {
      return normalizeActivities(nested as ASIOneResponseShape);
    }
    return [];
  }

  return normalizeActivities(parsed as ASIOneResponseShape);
}

function parseVoiceItineraryPayload(rawText: string): VoiceItineraryPayload | null {
  try {
    const parsed = JSON.parse(rawText) as VoiceItineraryPayload;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function buildVoiceFallbackActivities(context?: VoiceFallbackContext | null): ASIOneActivity[] {
  const baseLatitude = Number.isFinite(context?.latitude ?? NaN) ? Number(context?.latitude) : 34.0522;
  const baseLongitude = Number.isFinite(context?.longitude ?? NaN) ? Number(context?.longitude) : -118.2437;
  const label = context?.label?.trim() || 'Current location';
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);

  const lunch = new Date();
  lunch.setHours(12, 0, 0, 0);

  return [
    {
      title: 'Start Here',
      location_name: `${label} — first stop`,
      lat: baseLatitude,
      lng: baseLongitude,
      start_time: morning.toISOString(),
      end_time: new Date(morning.getTime() + 45 * 60 * 1000).toISOString(),
      tags: ['start', 'voice fallback'],
      cost: 0,
    },
    {
      title: 'Next Nearby Stop',
      location_name: `${label} — nearby idea`,
      lat: baseLatitude + 0.01,
      lng: baseLongitude + 0.01,
      start_time: lunch.toISOString(),
      end_time: new Date(lunch.getTime() + 60 * 60 * 1000).toISOString(),
      tags: ['follow-up', 'voice fallback'],
      cost: 0,
    },
  ];
}

function buildActivitiesFromPlaces(
  places: Array<{
    name: string;
    lat: number;
    lng: number;
    category?: string;
    displayAddress?: string | null;
    openingHours?: string | null;
  }>,
  context?: VoiceFallbackContext | null
) {
  const start = new Date();
  start.setHours(9, 0, 0, 0);

  return places.slice(0, 4).map((place, index) => {
    const startTime = new Date(start.getTime() + index * 75 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    const category = place.category ?? 'attractions';

    return {
      title: place.name,
      location_name: place.displayAddress ? `${place.name} · ${place.displayAddress}` : place.name,
      lat: place.lat,
      lng: place.lng,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      tags: [category, 'voice itinerary', context?.label?.trim() || 'current location'].filter(Boolean) as string[],
      cost: 0,
      venue_hours: place.openingHours ?? null,
      description: `Auto-generated from your voice request near ${context?.label?.trim() || 'your current location'}.`,
    } satisfies ASIOneActivity;
  });
}

async function buildVoiceFallbackActivitiesFromNearbyPlaces(
  payload: VoiceItineraryPayload | null,
  context?: VoiceFallbackContext | null
): Promise<ASIOneActivity[]> {
  const locationLabel = context?.label?.trim() || payload?.location_context?.label?.trim() || 'Current location';
  const latitude = Number.isFinite(payload?.location_context?.latitude ?? NaN)
    ? Number(payload?.location_context?.latitude)
    : context?.latitude ?? null;
  const longitude = Number.isFinite(payload?.location_context?.longitude ?? NaN)
    ? Number(payload?.location_context?.longitude)
    : context?.longitude ?? null;
  const originCoords =
    typeof latitude === 'number' && typeof longitude === 'number'
      ? { latitude, longitude }
      : undefined;
  const searchQuery = payload?.intent?.search_query?.trim() || payload?.transcript?.trim() || 'hike';
  const radiusMeters = Number.isFinite(payload?.intent?.radius_meters ?? NaN) ? Number(payload?.intent?.radius_meters) : 12000;
  const limit = Math.max(1, Math.min(Number.isFinite(payload?.intent?.limit ?? NaN) ? Number(payload?.intent?.limit) : 4, 4));

  try {
    const nearby = await suggestPlacesForLocation(locationLabel, searchQuery, originCoords, radiusMeters, limit);
    if (nearby.places.length) {
      return buildActivitiesFromPlaces(
        nearby.places.map((place) => ({
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
          displayAddress: place.displayAddress,
          openingHours: place.openingHours,
        })),
        context ?? payload?.location_context ?? null
      );
    }
  } catch (error) {
    console.warn('Voice fallback nearby place lookup failed:', error);
  }

  return buildVoiceFallbackActivities(context ?? payload?.location_context ?? null);
}

type AsiChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
      reasoning_content?: string;
    };
    message?: {
      content?: string | null;
    };
  }>;
};

async function readAsiResponseText(response: Response): Promise<{ text: string; streamed: boolean }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return { text: await response.text(), streamed: false };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { text: await response.text(), streamed: false };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedContent = '';

  const flushEvent = (eventBlock: string) => {
    const lines = eventBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data) as AsiChatCompletionChunk;
        const deltaContent = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? '';
        if (deltaContent) {
          accumulatedContent += deltaContent;
        }
      } catch (error) {
        console.warn('Failed to parse streamed ASI chunk:', error);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const eventBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      flushEvent(eventBlock);
      separatorIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    flushEvent(buffer);
  }

  return { text: accumulatedContent || decoder.decode(), streamed: true };
}

function buildResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'trip_itinerary',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itinerary_name: { type: 'string' },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                location_name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                cost: { type: 'number' },
                description: { type: 'string' },
                venue_hours: {},
                weather_snapshot: {},
                rating: {
                  anyOf: [{ type: 'integer' }, { type: 'null' }],
                },
              },
              required: ['title', 'location_name', 'lat', 'lng', 'start_time', 'end_time', 'tags', 'cost'],
            },
            minItems: 1,
          },
        },
        required: ['activities', 'itinerary_name'],
      },
    },
  };
}

export async function callASIOneParser(rawText: string, fallbackContext?: VoiceFallbackContext | null): Promise<ASIOneActivity[]> {
  const endpoint = buildAsiEndpoint(getAsiParsePath());
  const voicePayload = parseVoiceItineraryPayload(rawText);

  if (!endpoint) {
    console.warn('ASI_BASE_URL is not configured. Falling back to local location-aware itinerary.');
    return buildVoiceFallbackActivitiesFromNearbyPlaces(voicePayload, fallbackContext ?? voicePayload?.location_context ?? null);
  }

  const apiKey = getAsiApiKey();
  const timeoutMs = getAsiTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestPayload = {
      model: 'asi1-mini',
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            'You are a geospatial planner. Extract the spoken itinerary transcript into a structured itinerary. If the input is short or lacks specific venues, use the supplied location_context coordinates to infer realistic nearby hiking trails, scenic stops, or coffee options in the immediate vicinity. Never return an empty activities array if travel intent is present. Return only valid JSON that matches the schema.',
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      response_format: buildResponseFormat(),
    };

    console.log('ASI itinerary request payload:', JSON.stringify(requestPayload));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.log('ASI itinerary raw response:', errorText);
      throw new Error(`ASI request failed with status ${response.status}: ${errorText || response.statusText}`);
    }

    const responseRead = await readAsiResponseText(response);
    console.log('ASI itinerary raw response:', responseRead.text);

    const content = responseRead.streamed
      ? responseRead.text
      : (JSON.parse(responseRead.text) as {
          choices?: Array<{
            message?: {
              content?: string | null;
            };
          }>;
        }).choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('ASI response did not include message content.');
    }

    const parsedContent = JSON.parse(content) as ASIOneStructuredResponse;
    const extractedActivities = extractStructuredActivities(content);
    const activities =
      extractedActivities.length > 0
        ? extractedActivities
        : normalizeActivities(
            parsedContent.activities ??
              parsedContent.data ??
              parsedContent.itinerary?.activities ??
              parsedContent.itinerary?.data ??
              parsedContent.itinerary?.stops ??
              parsedContent.stops ??
              []
          );

    if (!activities.length) {
      console.warn('ASI response did not include activities; falling back to local location-aware itinerary.');
      return buildVoiceFallbackActivitiesFromNearbyPlaces(voicePayload, fallbackContext ?? voicePayload?.location_context ?? null);
    }

    return activities;
  } catch (error) {
    console.error('ASI parser request failed, falling back to local stub:', error);
    return buildVoiceFallbackActivitiesFromNearbyPlaces(voicePayload, fallbackContext ?? voicePayload?.location_context ?? null);
  } finally {
    clearTimeout(timeout);
  }
}

function getDeepgramBaseUrl() {
  return getBackendEnv('DEEPGRAM_BASE_URL') ?? 'https://api.deepgram.com';
}

function getDeepgramApiKey() {
  return getBackendEnv('DEEPGRAM_API_KEY');
}

function getDeepgramEndpoint() {
  const baseUrl = getDeepgramBaseUrl();
  return new URL(
    '/v1/listen?model=nova-3&smart_format=true&punctuate=true&numerals=true&utterances=true&paragraphs=true&diarize=true&detect_language=true',
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  ).toString();
}

function extractTranscript(payload: DeepgramResponse) {
  return payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
}

export async function transcribeDeepgramAudio(audioBase64: string, mimeType: string): Promise<VoiceTranscriptionPayload> {
  const apiKey = getDeepgramApiKey();
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured.');
  }

  const audioBytes = Buffer.from(audioBase64, 'base64');
  const response = await fetch(getDeepgramEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeType || 'audio/mp4',
    },
    body: audioBytes,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Deepgram transcription failed with status ${response.status}: ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as DeepgramResponse;
  const transcript = extractTranscript(data);

  if (!transcript) {
    throw new Error('Deepgram transcription returned no transcript.');
  }

  return {
    transcript,
    language: data.metadata?.language ?? null,
    durationSeconds: typeof data.metadata?.duration === 'number' ? data.metadata.duration : null,
    words: data.results?.channels?.[0]?.alternatives?.[0]?.words ?? [],
    utterances: data.results?.utterances ?? [],
    raw: data,
  };
}

function buildVoiceIntentFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'voice_place_intent',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location_query: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          search_query: { type: 'string' },
          radius_meters: { type: 'integer' },
          limit: { type: 'integer' },
        },
        required: ['location_query', 'search_query', 'radius_meters', 'limit'],
      },
    },
  };
}

export async function callASIOneVoiceIntent(
  input: VoiceTranscriptionPayload,
  locationContext?: { label?: string | null; latitude?: number; longitude?: number } | null
): Promise<VoicePlaceIntent> {
  const endpoint = buildAsiEndpoint(getAsiParsePath());
  const transcript = input.transcript.trim();

  if (!endpoint) {
    return {
      location_query: locationContext?.label?.trim() || null,
      search_query: transcript,
      radius_meters: 7200,
      limit: 24,
    };
  }

  const apiKey = getAsiApiKey();
  const timeoutMs = getAsiTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: 'asi1-mini',
        messages: [
          {
            role: 'system',
            content:
              'Convert the spoken trip request into a compact JSON object for itinerary generation. Use transcript structure, utterances, words, and user location to infer intent, timing, and geographic scope. Return only valid JSON that matches the schema.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              transcript: input.transcript,
              language: input.language,
              duration_seconds: input.durationSeconds,
              words: input.words.slice(0, 120),
              utterances: input.utterances.slice(0, 20),
              raw_deepgram: {
                request_id: input.raw.metadata?.request_id ?? null,
                model_name: input.raw.metadata?.model_info?.name ?? null,
                model_version: input.raw.metadata?.model_info?.version ?? null,
              },
              location_context: {
                label: locationContext?.label ?? null,
                latitude: locationContext?.latitude ?? null,
                longitude: locationContext?.longitude ?? null,
              },
            }),
          },
        ],
        response_format: buildVoiceIntentFormat(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`ASI voice intent request failed with status ${response.status}: ${errorText || response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('ASI voice intent response did not include message content.');
    }

    const parsed = JSON.parse(content) as VoicePlaceIntent;
    return {
      location_query:
        typeof parsed.location_query === 'string' && parsed.location_query.trim()
          ? parsed.location_query.trim()
          : (locationContext?.label?.trim() || null),
      search_query: typeof parsed.search_query === 'string' && parsed.search_query.trim() ? parsed.search_query.trim() : transcript,
      radius_meters: Number.isFinite(parsed.radius_meters) && parsed.radius_meters > 0 ? Math.round(parsed.radius_meters) : 7200,
      limit: Number.isFinite(parsed.limit) && parsed.limit > 0 ? Math.round(parsed.limit) : 24,
    };
  } catch (error) {
    console.error('ASI voice intent request failed, falling back to simple parsing:', error);
    return {
      location_query: locationContext?.label?.trim() || null,
      search_query: transcript,
      radius_meters: 7200,
      limit: 24,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackParsedActivities(): ASIOneActivity[] {
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);

  const lateMorning = new Date();
  lateMorning.setHours(11, 30, 0, 0);

  return [
    {
      title: 'Arrive & Morning Coffee',
      location_name: 'Blue Bottle Coffee, Shibuya',
      lat: 35.6595,
      lng: 139.7002,
      start_time: morning.toISOString(),
      end_time: new Date(morning.getTime() + 60 * 60 * 1000).toISOString(),
      tags: ['food crawl', 'morning coffee'],
      cost: 12.5,
    },
    {
      title: 'Panoramic Viewpoint',
      location_name: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
      start_time: lateMorning.toISOString(),
      end_time: new Date(lateMorning.getTime() + 90 * 60 * 1000).toISOString(),
      tags: ['sightseeing'],
      cost: 20,
    },
  ];
}


export async function schedulePokeReminder(userId: string, activityName: string, startTime: string) {
  console.log(`Scheduling push reminder notification with Poke for: "${activityName}"`);
  return {
    userId,
    startTime,
    poke_job_id: `poke_reminder_${Math.random().toString(36).substring(2, 11)}`,
  };
}
