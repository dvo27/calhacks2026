import express from 'express';
import { Queue } from 'bullmq';
import { URL } from 'node:url';
import { supabase } from './services/supabase.js';
import { loadBackendEnv, getBackendEnv } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import type { AuthenticatedRequest } from './middleware/auth.js';

loadBackendEnv();

const app = express();
const PORT = Number(getBackendEnv('PORT') ?? 5001);
const REDIS_URL = getBackendEnv('REDIS_URL') ?? 'redis://127.0.0.1:6379';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// 1. Initialize your BullMQ Queue to pass jobs off to your background worker
const redisUrl = new URL(REDIS_URL);

const itineraryQueue = new Queue('itinerary-processing', {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: 3, // producer should fail fast, not hang forever
  },
});

itineraryQueue.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

itineraryQueue.waitUntilReady()
  .then(() => console.log('🚀 Connected to Redis server successfully.'))
  .catch((err) => console.error('❌ Redis failed to become ready:', err.message));

app.get('/api/health', async (_req: express.Request, res: express.Response) => {
  try {
    const { error } = await supabase.from('trips').select('id').limit(1);

    if (error) {
      res.status(500).json({
        status: 'error',
        message: 'API is up, but Supabase access failed.',
        details: error.message,
      });
      return;
    }

    res.status(200).json({ status: 'healthy', supabase: true });
  } catch (error: any) {
    res.status(500).json({ status: 'crash', error: error.message });
  }
});

app.post('/api/trips/generate', requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user?.id;
    const { title, destination, rawText, startDate, endDate } = req.body;

    if (!title || !destination || !rawText) {
      res.status(400).json({ error: 'Missing mandatory tracking parameters: title, destination, and rawText are required.' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
      return;
    }

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        user_id: userId,
        title,
        destination,
        start_date: startDate || new Date().toISOString(),
        end_date: endDate || new Date().toISOString(),
        is_public: false
      })
      .select('id')
      .single();

    if (tripError || !trip) {
      console.error('Supabase DB Trip insertion failed:', tripError);
      res.status(500).json({ error: 'Database transaction failed while creating trip layout shell.' });
      return;
    }

    const job = await itineraryQueue.add(`parse_${trip.id}`, {
      tripId: trip.id,
      userId,
      rawText
    });

    res.status(202).json({
      success: true,
      message: 'Itinerary submitted successfully. Mapping engines are compiling routes.',
      tripId: trip.id,
      jobId: job.id
    });

  } catch (error) {
    console.error('Critical failure handling trip generation route sequence:', error);
    res.status(500).json({ error: 'Internal Server Error processing automation flow.' });
  }
});

app.get('/api/trips/feed', async (_req: express.Request, res: express.Response) => {
  try {
    const { data: publicTrips, error } = await supabase
      .from('trips')
      .select(`
        id, title, destination, total_budget, total_distance_miles, total_drive_time_minutes,
        activities (id, title, location_name, cost, start_time)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({ trips: publicTrips });
  } catch (error) {
    console.error('Error fetching dashboard discover feeds:', error);
    res.status(500).json({ error: 'Failed to retrieve feed arrays.' });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});