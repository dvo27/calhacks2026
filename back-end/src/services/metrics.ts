import { supabase } from './supabase.js';

export async function getTripEngagementCounts(tripId: number | string) {
  const [likes, comments, shares] = await Promise.all([
    supabase.from('likes').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    supabase.from('shares').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
  ]);

  return {
    likes: likes.count ?? 0,
    comments: comments.count ?? 0,
    shares: shares.count ?? 0,
  };
}

export async function getUserSocialCounts(userId: string) {
  const [trips, followers, following, collections] = await Promise.all([
    supabase.from('trips').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
    supabase.from('collections').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  return {
    trips: trips.count ?? 0,
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    collections: collections.count ?? 0,
  };
}

export async function getTripOwnerId(tripId: number | string) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, user_id')
    .eq('id', tripId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.user_id ?? null;
}

export async function ensureTripOwnership(tripId: number | string, userId: string) {
  const ownerId = await getTripOwnerId(tripId);

  if (!ownerId) {
    return { exists: false, owner: false };
  }

  return {
    exists: true,
    owner: ownerId === userId,
  };
}
