import express from 'express';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';
// CRITICAL: Internal relative imports must use the explicit .js extension
import { supabase } from './services/supabase.js';
import { requireAuth } from './middleware/auth.js';
import type { AuthenticatedRequest } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5001);

// Global Middleware to parse incoming JSON request bodies
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// 1. Initialize your BullMQ Queue to pass jobs off to your background worker
const itineraryQueue = new Queue('itinerary-processing', {
  connection: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  }
});

console.log('🚀 API Queue system connected to Redis server successfully.');

/**
 * @route   POST /api/trips/generate
 * @desc    Submit raw textual itinerary data to parse and map out a trip.
 * @access  Protected (Requires Bearer Supabase JWT Token)
 */
app.post('/api/trips/generate', requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user?.id;
    const { title, destination, rawText, startDate, endDate } = req.body;

    // Fast-fail validation checks
    if (!title || !destination || !rawText) {
      res.status(400).json({ error: 'Missing mandatory tracking parameters: title, destination, and rawText are required.' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
      return;
    }

    // 1. Create the base parent record tracking this trip itinerary inside Supabase
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        user_id: userId,
        title,
        destination,
        start_date: startDate || new Date().toISOString(),
        end_date: endDate || new Date().toISOString(),
        is_public: false // Hide the trip while the background worker is parsing coordinates
      })
      .select('id')
      .single();

    if (tripError || !trip) {
      console.error('Supabase DB Trip insertion failed:', tripError);
      res.status(500).json({ error: 'Database transaction failed while creating trip layout shell.' });
      return;
    }

    // 2. Offload the heavy text parsing loop out to the BullMQ redis cluster thread
    const job = await itineraryQueue.add(`parse_${trip.id}`, {
      tripId: trip.id,
      userId,
      rawText
    });

    // 3. Return immediate success feedback to the Expo mobile app
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

/**
 * @route   GET /api/trips/feed
 * @desc    Fetch publicly accessible completed routes using PostGIS filters
 * @access  Public
 */
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
