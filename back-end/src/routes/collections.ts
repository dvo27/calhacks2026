import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

async function collectionBelongsToUser(collectionId: string, userId: string) {
  const { data, error } = await supabase
    .from('collections')
    .select('id, user_id, name, created_at')
    .eq('id', collectionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { exists: false, owner: false, collection: null };
  }

  return {
    exists: true,
    owner: data.user_id === userId,
    collection: data,
  };
}

async function loadCollectionTrips(collectionId: string) {
  const { data, error } = await supabase
    .from('collection_trips')
    .select('trip_id, trip:trips (id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost)')
    .eq('collection_id', collectionId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export function createCollectionsRouter() {
  const router = Router();

  router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: collections, error } = await supabase
        .from('collections')
        .select('id, name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (collections ?? []).map(async (collection) => ({
          ...collection,
          trips: await loadCollectionTrips(String(collection.id)),
        }))
      );

      res.status(200).json({ collections: enriched });
    } catch (error) {
      console.error('Error loading collections:', error);
      res.status(500).json({ error: 'Failed to load collections.' });
    }
  });

  router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { name } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!name) {
        res.status(400).json({ error: 'Collection name is required.' });
        return;
      }

      const { data, error } = await supabase
        .from('collections')
        .insert({
          user_id: userId,
          name,
        })
        .select('id, name, created_at')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to create collection.' });
        return;
      }

      res.status(201).json({ collection: data });
    } catch (error) {
      console.error('Error creating collection:', error);
      res.status(500).json({ error: 'Failed to create collection.' });
    }
  });

  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const id = String(req.params.id ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await collectionBelongsToUser(id, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Collection not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this collection.' });
        return;
      }

      const trips = await loadCollectionTrips(id);

      res.status(200).json({ collection: ownership.collection, trips });
    } catch (error) {
      console.error('Error loading collection detail:', error);
      res.status(500).json({ error: 'Failed to load collection detail.' });
    }
  });

  router.post('/:id/trips', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const collectionId = String(req.params.id ?? '');
      const { trip_id } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!trip_id) {
        res.status(400).json({ error: 'trip_id is required.' });
        return;
      }

      const ownership = await collectionBelongsToUser(collectionId, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Collection not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this collection.' });
        return;
      }

      const { data: existing, error: lookupError } = await supabase
        .from('collection_trips')
        .select('collection_id, trip_id')
        .eq('collection_id', collectionId)
        .eq('trip_id', trip_id)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) {
        res.status(200).json({ added: true, alreadyAdded: true });
        return;
      }

      const { error } = await supabase.from('collection_trips').insert({
        collection_id: collectionId,
        trip_id,
      });

      if (error) throw error;

      res.status(201).json({ added: true });
    } catch (error) {
      console.error('Error adding trip to collection:', error);
      res.status(500).json({ error: 'Failed to add trip to collection.' });
    }
  });

  router.delete('/:id/trips/:tripId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const collectionId = String(req.params.id ?? '');
      const tripId = String(req.params.tripId ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const ownership = await collectionBelongsToUser(collectionId, userId);
      if (!ownership.exists) {
        res.status(404).json({ error: 'Collection not found.' });
        return;
      }
      if (!ownership.owner) {
        res.status(403).json({ error: 'Forbidden: You do not own this collection.' });
        return;
      }

      const { error } = await supabase
        .from('collection_trips')
        .delete()
        .eq('collection_id', collectionId)
        .eq('trip_id', tripId);

      if (error) throw error;

      res.status(200).json({ removed: true });
    } catch (error) {
      console.error('Error removing trip from collection:', error);
      res.status(500).json({ error: 'Failed to remove trip from collection.' });
    }
  });

  return router;
}
