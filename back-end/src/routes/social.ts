import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { invalidateMainFeedCache } from '../services/feed.js';
import { getPublicUsersByIds } from '../services/users.js';
import { getTripEngagementCounts } from '../services/metrics.js';

async function getTripAccess(tripId: string) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, user_id, is_public, title')
    .eq('id', tripId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export function createSocialRouter() {
  const router = Router();

  router.post('/trips/:id/like', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const tripId = String(req.params.id ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const trip = await getTripAccess(tripId);
      if (!trip) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!trip.is_public && trip.user_id !== userId) {
        res.status(403).json({ error: 'Forbidden: This trip is private.' });
        return;
      }

      const { data: existingLike, error: lookupError } = await supabase
        .from('likes')
        .select('id')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existingLike) {
        res.status(200).json({ liked: true, alreadyLiked: true, engagement: await getTripEngagementCounts(tripId) });
        return;
      }

      const { error } = await supabase.from('likes').insert({
        user_id: userId,
        trip_id: tripId,
      });

      if (error) throw error;
      await invalidateMainFeedCache();

      res.status(201).json({ liked: true, engagement: await getTripEngagementCounts(tripId) });
    } catch (error) {
      console.error('Error liking trip:', error);
      res.status(500).json({ error: 'Failed to like trip.' });
    }
  });

  router.delete('/trips/:id/like', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const tripId = String(req.params.id ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', userId);

      if (error) throw error;
      await invalidateMainFeedCache();

      res.status(200).json({ liked: false, engagement: await getTripEngagementCounts(tripId) });
    } catch (error) {
      console.error('Error unliking trip:', error);
      res.status(500).json({ error: 'Failed to unlike trip.' });
    }
  });

  router.get('/trips/:id/likes', async (req, res) => {
    try {
      const tripId = String(req.params.id ?? '');

      const [likesResult, tripCounts] = await Promise.all([
        supabase.from('likes').select('id, user_id, created_at').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(20),
        getTripEngagementCounts(tripId),
      ]);

      if (likesResult.error) throw likesResult.error;

      const userMap = await getPublicUsersByIds((likesResult.data ?? []).map((row) => row.user_id));
      const likes = (likesResult.data ?? []).map((row) => ({
        ...row,
        user: userMap.get(row.user_id) ?? null,
      }));

      res.status(200).json({ likes, engagement: tripCounts });
    } catch (error) {
      console.error('Error loading likes:', error);
      res.status(500).json({ error: 'Failed to load likes.' });
    }
  });

  router.post('/trips/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const tripId = String(req.params.id ?? '');
      const { comment_text } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (!comment_text) {
        res.status(400).json({ error: 'comment_text is required.' });
        return;
      }

      const trip = await getTripAccess(tripId);
      if (!trip) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!trip.is_public && trip.user_id !== userId) {
        res.status(403).json({ error: 'Forbidden: This trip is private.' });
        return;
      }

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: userId,
          trip_id: tripId,
          comment_text,
        })
        .select('id, user_id, trip_id, comment_text, created_at')
        .single();

      if (error || !data) throw error;

      await invalidateMainFeedCache();
      res.status(201).json({ comment: data, engagement: await getTripEngagementCounts(tripId) });
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ error: 'Failed to add comment.' });
    }
  });

  router.get('/trips/:id/comments', async (req, res) => {
    try {
      const tripId = String(req.params.id ?? '');

      const { data, error } = await supabase
        .from('comments')
        .select('id, user_id, trip_id, comment_text, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const userMap = await getPublicUsersByIds((data ?? []).map((row) => row.user_id));
      const comments = (data ?? []).map((row) => ({
        ...row,
        user: userMap.get(row.user_id) ?? null,
      }));

      res.status(200).json({ comments });
    } catch (error) {
      console.error('Error loading comments:', error);
      res.status(500).json({ error: 'Failed to load comments.' });
    }
  });

  router.post('/trips/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const tripId = String(req.params.id ?? '');
      const { platform = 'internal' } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const trip = await getTripAccess(tripId);
      if (!trip) {
        res.status(404).json({ error: 'Trip not found.' });
        return;
      }
      if (!trip.is_public && trip.user_id !== userId) {
        res.status(403).json({ error: 'Forbidden: This trip is private.' });
        return;
      }

      const { data, error } = await supabase
        .from('shares')
        .insert({
          user_id: userId,
          trip_id: tripId,
          platform,
        })
        .select('id, user_id, trip_id, platform, created_at')
        .single();

      if (error || !data) throw error;

      await invalidateMainFeedCache();
      res.status(201).json({ share: data, engagement: await getTripEngagementCounts(tripId) });
    } catch (error) {
      console.error('Error sharing trip:', error);
      res.status(500).json({ error: 'Failed to share trip.' });
    }
  });

  router.get('/users/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q || q.length < 2) {
        res.status(200).json({ users: [] });
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .ilike('username', `%${q}%`)
        .limit(20);

      if (error) throw error;
      res.status(200).json({ users: data ?? [] });
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Failed to search users.' });
    }
  });

  router.post('/users/:id/follow', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const followingId = String(req.params.id ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      if (followingId === userId) {
        res.status(400).json({ error: 'You cannot follow yourself.' });
        return;
      }

      const { data: existing, error: lookupError } = await supabase
        .from('follows')
        .select('follower_id, following_id')
        .eq('follower_id', userId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) {
        res.status(200).json({ following: true, alreadyFollowing: true });
        return;
      }

      const { error } = await supabase.from('follows').insert({
        follower_id: userId,
        following_id: followingId,
      });

      if (error) throw error;

      res.status(201).json({ following: true });
    } catch (error) {
      console.error('Error following user:', error);
      res.status(500).json({ error: 'Failed to follow user.' });
    }
  });

  router.delete('/users/:id/follow', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const followingId = String(req.params.id ?? '');

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('following_id', followingId);

      if (error) throw error;

      res.status(200).json({ following: false });
    } catch (error) {
      console.error('Error unfollowing user:', error);
      res.status(500).json({ error: 'Failed to unfollow user.' });
    }
  });

  router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data: ownedTrips, error: tripsError } = await supabase
        .from('trips')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (tripsError) throw tripsError;

      const tripIds = (ownedTrips ?? []).map((trip) => trip.id);

      const [likesResult, commentsResult, sharesResult, followersResult] = await Promise.all([
        tripIds.length
          ? supabase.from('likes').select('id, user_id, trip_id, created_at').in('trip_id', tripIds).order('created_at', { ascending: false }).limit(25)
          : Promise.resolve({ data: [], error: null }),
        tripIds.length
          ? supabase.from('comments').select('id, user_id, trip_id, comment_text, created_at').in('trip_id', tripIds).order('created_at', { ascending: false }).limit(25)
          : Promise.resolve({ data: [], error: null }),
        tripIds.length
          ? supabase.from('shares').select('id, user_id, trip_id, platform, created_at').in('trip_id', tripIds).order('created_at', { ascending: false }).limit(25)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('follows').select('follower_id, following_id, created_at').eq('following_id', userId).order('created_at', { ascending: false }).limit(25),
      ]);

      if (likesResult.error) throw likesResult.error;
      if (commentsResult.error) throw commentsResult.error;
      if (sharesResult.error) throw sharesResult.error;
      if (followersResult.error) throw followersResult.error;

      const userIds = [
        ...(likesResult.data ?? []).map((row) => row.user_id),
        ...(commentsResult.data ?? []).map((row) => row.user_id),
        ...(sharesResult.data ?? []).map((row) => row.user_id),
        ...(followersResult.data ?? []).map((row) => row.follower_id),
      ];
      const tripLookup = new Map((ownedTrips ?? []).map((trip) => [trip.id, trip]));
      const userMap = await getPublicUsersByIds(userIds);

      const events = [
        ...(likesResult.data ?? []).map((row) => ({
          type: 'like',
          created_at: row.created_at,
          trip: tripLookup.get(row.trip_id) ?? null,
          actor: userMap.get(row.user_id) ?? null,
        })),
        ...(commentsResult.data ?? []).map((row) => ({
          type: 'comment',
          created_at: row.created_at,
          comment_text: row.comment_text,
          trip: tripLookup.get(row.trip_id) ?? null,
          actor: userMap.get(row.user_id) ?? null,
        })),
        ...(sharesResult.data ?? []).map((row) => ({
          type: 'share',
          created_at: row.created_at,
          platform: row.platform,
          trip: tripLookup.get(row.trip_id) ?? null,
          actor: userMap.get(row.user_id) ?? null,
        })),
        ...(followersResult.data ?? []).map((row) => ({
          type: 'follow',
          created_at: row.created_at,
          actor: userMap.get(row.follower_id) ?? null,
        })),
      ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

      res.status(200).json({ events });
    } catch (error) {
      console.error('Error loading activity feed:', error);
      res.status(500).json({ error: 'Failed to load activity feed.' });
    }
  });

  return router;
}
