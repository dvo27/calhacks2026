import { supabase } from './supabase.js';

export async function ensurePublicUser(userId: string, email?: string | null) {
  const { data: existingUser, error: lookupError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      username: null,
      avatar_url: null,
    })
    .select('id, username, avatar_url, created_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPublicUsersByIds(userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, { id: string; username: string | null; avatar_url: string | null; created_at: string }>();
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, avatar_url, created_at')
    .in('id', userIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((user) => [user.id, user]));
}
