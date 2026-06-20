import { createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import ws from 'ws';
import { getBackendEnv } from '../config/env.js';

const supabaseUrl = getBackendEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = getBackendEnv('SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY');
const realtimeTransport = ws as unknown as WebSocketLikeConstructor;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'CRITICAL BOOT ERROR: Missing Supabase env vars. Expected SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SECRET_KEY.'
  );
}

// Low-level high-privilege client bypassing RLS for background services
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  realtime: {
    transport: realtimeTransport,
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
