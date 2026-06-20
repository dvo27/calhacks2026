import type { Queue } from 'bullmq';
import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ensureTripOwnership, getTripEngagementCounts } from '../services/metrics.js';

type TripsRouterOptions = {
  itineraryQueue: Queue;
};

export function createTripsRouter({ itineraryQueue }: TripsRouterOptions) {
  const router = Router();

  router.post(
    '/generate',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { title, rawText } = req.body;

        if (!title || !rawText) {
          res.status(400).json({
            error: 'Missing mandatory tracking parameters: title and rawText are required.',
          });
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
            is_public: false,
            total_budget: 0,
            total_distance_miles: null,
            total_drive_time_minutes: null,
            total_gas_cost: null,
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
          rawText,
        });

        res.status(202).json({
          success: true,
          message: 'Itinerary submitted successfully. Mapping engines are compiling routes.',
          tripId: trip.id,
          jobId: job.id,
        });
      } catch (error) {
        console.error('Critical failure handling trip generation route sequence:', error);
        res.status(500).json({ error: 'Internal Server Error processing automation flow.' });
      }
    }
  );

  router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { title } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!title) {
        res.status(400).json({ error: 'Title is required to create a trip draft.' });
        return;
      }

      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          user_id: userId,
          title,
          is_public: false,
          total_budget: 0,
          total_distance_miles: null,
          total_drive_time_minutes: null,
          total_gas_cost: null,
        })
        .select('id, title, is_public, created_at')
        .single();

      if (error || !trip) {
        res.status(500).json({ error: 'Failed to create trip draft.' });
        return;
      }

      res.status(201).json({ trip });
    } catch (error) {
      console.error('Error creating trip draft:', error);
      res.status(500).json({ error: 'Failed to create trip draft.' });
    }
  });

  router.get('/feed', async (_req, res) => {
    try {
      const { data: publicTrips, error } = await supabase
        .from('trips')
        .select(`
          id, title, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost, created_at,
          user:users (id, username, avatar_url),
          activities (id, title, location_name, cost, start_time, end_time, tags)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const tripsWithCounts = await Promise.all(
        (publicTrips ?? []).map(async (trip) => ({
          ...trip,
          engagement: await getTripEngagementCounts(trip.id),
        }))
      );

      res.status(200).json({ trips: tripsWithCounts });
    } catch (error) {
      console.error('Error fetching dashboard discover feeds:', error);
      res.status(500).json({ error: 'Failed to retrieve feed arrays.' });
    }
  });

  router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: trips, error } = await supabase
        .from('trips')
        .select('id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const tripsWithCounts = await Promise.all(
        (trips ?? []).map(async (trip) => ({
          ...trip,
          engagement: await getTripEngagementCounts(trip.id),
        }))
      );

      res.status(200).json({ trips: tripsWithCounts });
    } catch (error) {
      console.error('Error fetching current user trips:', error);
      res.status(500).json({ error: 'Failed to retrieve your trips.' });
    }
  });

  router.post('/:id/publish', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await ensureTripOwnership(id, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this trip.' });
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .update({ is_public: true })
        .eq('id', id)
        .select('id, title, is_public')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to publish trip.' });
        return;
      }

      res.status(200).json({ trip: data });
    } catch (error) {
      console.error('Error publishing trip:', error);
      res.status(500).json({ error: 'Failed to publish trip.' });
    }
  });

  router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id ?? '');
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await ensureTripOwnership(id, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this trip.' });
        return;
      }

      const updatePayload: Record<string, unknown> = {};
      for (const field of ['title', 'is_public', 'total_budget', 'total_distance_miles', 'total_drive_time_minutes', 'total_gas_cost'] as const) {
        if (req.body[field] !== undefined) {
          updatePayload[field] = req.body[field];
        }
      }

      if (!Object.keys(updatePayload).length) {
        res.status(400).json({ error: 'No valid trip fields were provided.' });
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .update(updatePayload)
        .eq('id', id)
        .select('id, title, is_public, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost, created_at')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to update trip.' });
        return;
      }

      res.status(200).json({ trip: data });
    } catch (error) {
      console.error('Error updating trip:', error);
      res.status(500).json({ error: 'Failed to update trip.' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const id = String(req.params.id ?? '');

      const { data: trip, error } = await supabase
        .from('trips')
        .select(`
          id, title, is_public, created_at,
          total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost,
          user:users (id, username, avatar_url),
          activities (
            id, title, description, location_name, start_time, end_time, cost, tags, location_coords, rating, venue_hours, weather_snapshot
          )
        `)
        .eq('id', id)
        .single();

      if (error || !trip) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }

      const engagement = await getTripEngagementCounts(trip.id);

      res.status(200).json({ trip: { ...trip, engagement } });
    } catch (error) {
      console.error('Error fetching trip detail:', error);
      res.status(500).json({ error: 'Failed to retrieve trip detail.' });
    }
  });

  return router;
}
