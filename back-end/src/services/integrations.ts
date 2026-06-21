import { getBackendEnv } from '../config/env.js';

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

type ASIOneResponseShape =
  | ASIOneActivity[]
  | {
      activities?: ASIOneActivity[];
      data?: ASIOneActivity[];
    };

type ASIOneStructuredResponse = {
  itinerary_name?: string;
  activities?: ASIOneActivity[];
  data?: ASIOneActivity[];
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

  return [];
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
          },
        },
        required: ['activities'],
      },
    },
  };
}


export async function callASIOneParser(rawText: string): Promise<ASIOneActivity[]> {
  const baseUrl = getAsiBaseUrl();

  if (!baseUrl) {
    console.warn('ASI_BASE_URL is not configured. Falling back to local stub itinerary generation.');
    return fallbackParsedActivities();
  }

  const apiKey = getAsiApiKey();
  const timeoutMs = getAsiTimeoutMs();
  const endpoint = new URL(getAsiParsePath(), baseUrl).toString();
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
        model: 'asi1',
        messages: [
          {
            role: 'system',
            content:
              'Extract the user itinerary into structured activities. Return only valid JSON that matches the provided schema. Each activity must represent one stop in a timeline and should include location, timing, tags, and cost.',
          },
          {
            role: 'user',
            content: rawText,
          },
        ],
        response_format: buildResponseFormat(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`ASI request failed with status ${response.status}: ${errorText || response.statusText}`);
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
      throw new Error('ASI response did not include message content.');
    }

    const parsedContent = JSON.parse(content) as ASIOneStructuredResponse;
    const activities = normalizeActivities(parsedContent.activities ?? parsedContent.data ?? []);

    if (!activities.length) {
      throw new Error('ASI response did not include any activities.');
    }

    return activities;
  } catch (error) {
    console.error('ASI parser request failed, falling back to local stub:', error);
    return fallbackParsedActivities();
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
