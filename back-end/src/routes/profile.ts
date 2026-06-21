import { Router, type Response } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getUserSocialCounts } from '../services/metrics.js';
import { getPublicUsersByIds } from '../services/users.js';

export function createProfileRouter() {
  const router = Router();

  router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const profileQuery = () => supabase.from('users').select('id, username, avatar_url, created_at').eq('id', userId).maybeSingle();
      let profileResult = await profileQuery();
      if (profileResult.error) throw profileResult.error;

      if (!profileResult.data) {
        console.warn(`Profile row missing for ${userId}; creating one now.`);
        const { data: createdProfile, error: createError } = await supabase
          .from('users')
          .upsert({
            id: userId,
            username: null,
            avatar_url: null,
          })
          .select('id, username, avatar_url, created_at')
          .single();

        if (createError) {
          throw createError;
        }

        profileResult = { data: createdProfile, error: null } as typeof profileResult;
      }

      const [tripsResult, draftTripsResult, collectionsResult] = await Promise.all([
        supabase
          .from('trips')
          .select('id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('trips')
          .select('id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost')
          .eq('user_id', userId)
          .eq('is_public', false)
          .order('created_at', { ascending: false }),
        supabase.from('collections').select('id, name, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);

      const stats = await getUserSocialCounts(userId);

      res.status(200).json({
        profile: profileResult.data,
        stats,
        trips: tripsResult.data ?? [],
        drafts: draftTripsResult.data ?? [],
        collections: collectionsResult.data ?? [],
      });
    } catch (error) {
      console.error('Error loading current profile:', error);
      res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { username, avatar_url } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const updatePayload: Record<string, unknown> = {};
      if (username !== undefined) updatePayload.username = username?.trim?.() || null;
      if (avatar_url !== undefined) updatePayload.avatar_url = avatar_url || null;

      if (!Object.keys(updatePayload).length) {
        res.status(400).json({ error: 'No valid profile fields were provided.' });
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, username, avatar_url, created_at')
        .single();

      if (error || !data) {
        res.status(500).json({ error: 'Failed to update profile.' });
        return;
      }

      res.status(200).json({ profile: data });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  router.get('/uid/:userId', async (req, res) => {
    try {
      const userId = String(req.params.userId ?? '');

      const { data: profile, error } = await supabase
        .from('users')
        .select('id, username, avatar_url, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!profile) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }

      const [stats, tripsResult] = await Promise.all([
        getUserSocialCounts(profile.id),
        supabase
          .from('trips')
          .select('id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost')
          .eq('user_id', profile.id)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
      ]);

      res.status(200).json({
        profile,
        stats,
        trips: tripsResult.data ?? [],
      });
    } catch (error) {
      console.error('Error loading profile by id:', error);
      res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  router.get('/:username', async (req, res) => {
    try {
      const username = String(req.params.username ?? '');

      const { data: profile, error } = await supabase
        .from('users')
        .select('id, username, avatar_url, created_at')
        .eq('username', username)
        .maybeSingle();

      if (error) throw error;
      if (!profile) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }

      const [stats, tripsResult] = await Promise.all([
        getUserSocialCounts(profile.id),
        supabase
          .from('trips')
          .select('id, title, is_public, created_at, total_budget, total_distance_miles, total_drive_time_minutes, total_gas_cost')
          .eq('user_id', profile.id)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
      ]);

      res.status(200).json({
        profile,
        stats,
        trips: tripsResult.data ?? [],
      });
    } catch (error) {
      console.error('Error loading public profile:', error);
      res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  router.get('/me/followers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data, error } = await supabase
        .from('follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userMap = await getPublicUsersByIds((data ?? []).map((row) => row.follower_id));
      const followers = (data ?? []).map((row) => ({
        created_at: row.created_at,
        follower: userMap.get(row.follower_id) ?? null,
      }));

      res.status(200).json({ followers });
    } catch (error) {
      console.error('Error loading followers:', error);
      res.status(500).json({ error: 'Failed to load followers.' });
    }
  });

  router.get('/me/following', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: Invalid context identity.' });
        return;
      }

      const { data, error } = await supabase
        .from('follows')
        .select('following_id, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userMap = await getPublicUsersByIds((data ?? []).map((row) => row.following_id));
      const following = (data ?? []).map((row) => ({
        created_at: row.created_at,
        following: userMap.get(row.following_id) ?? null,
      }));

      res.status(200).json({ following });
    } catch (error) {
      console.error('Error loading following:', error);
      res.status(500).json({ error: 'Failed to load following.' });
    }
  });

  return router;
}
