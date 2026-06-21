import { Worker, Job } from 'bullmq';
import { supabase } from './services/supabase.js';
import { callASIOneParser, schedulePokeReminder } from './services/integrations.js';
import { loadBackendEnv, getBackendEnv } from './config/env.js';
import { invalidateTripTimeline } from './services/timeline.js';
import { invalidateMainFeedCache } from './services/feed.js';

loadBackendEnv();

interface ItineraryJobData {
  tripId: string;
  userId: string;
  rawText: string;
}

console.log('👷 Background Worker Process is initializing...');

// Spin up the worker loop
const worker = new Worker<ItineraryJobData>(
  'itinerary-processing', // Must match your API queue name exactly
  async (job: Job<ItineraryJobData>) => {
    const { tripId, userId, rawText } = job.data;
    console.log(`[Job ${job.id}] Started processing optimization loop for Trip: ${tripId}`);

    try {
      // 1. Fire off the raw text to your ASI:One itinerary engine
      const parsedActivities = await callASIOneParser(rawText);
      let totalCalculatedCost = 0;

      // 2. Loop through and save each structured activity to your PostGIS database
      for (const act of parsedActivities) {
        totalCalculatedCost += act.cost;

        const { error: actError } = await supabase
          .from('activities')
          .insert({
            trip_id: tripId,
            title: act.title,
            location_name: act.location_name,
            start_time: act.start_time,
            end_time: act.end_time,
            tags: act.tags,
            cost: act.cost,
            // Construct a standard PostGIS point geometry string from coords
            location_coords: `POINT(${act.lng} ${act.lat})`
          });

        if (actError) throw actError;

        // 3. Dispatch an asynchronous hook to Poke for alert scheduling
        await schedulePokeReminder(userId, act.title, act.start_time);
      }

      // 4. Update parent trip metadata rollups 
      const { error: tripUpdateError } = await supabase
        .from('trips')
        .update({
          total_budget: totalCalculatedCost,
          total_distance_miles: 5.8, // Fallback/calculated route metrics placeholder
          total_drive_time_minutes: 22,
          is_public: true // Reveal the trip to the public dashboard feed now that processing is finished
        })
        .eq('id', tripId);

      if (tripUpdateError) throw tripUpdateError;

      await invalidateTripTimeline(tripId);
      await invalidateMainFeedCache();

      console.log(`[Job ${job.id}] Successfully generated timeline, synced hooks, and compiled metrics!`);
      return { success: true, count: parsedActivities.length };

    } catch (error: any) {
      console.error(`[Job ${job.id}] Execution failed inside processing thread:`, error);
      // Throwing passes the error back to BullMQ to automatically manage retries
      throw error; 
    }
  },
  { 
    // Fixes structural ioredis type-mismatch by passing the configuration directly to BullMQ
    connection: {
      url: getBackendEnv('REDIS_URL') ?? 'redis://127.0.0.1:6379',
      maxRetriesPerRequest: null, 
    },
    concurrency: 2 // Processes up to 2 itineraries simultaneously 
  }
);

// Global Worker System Listeners
worker.on('completed', (job) => console.log(`✨ Job ${job.id} completed cleanly.`));
worker.on('failed', (job, err) => console.error(`🚨 Job ${job?.id} failed critically: ${err.message}`));
