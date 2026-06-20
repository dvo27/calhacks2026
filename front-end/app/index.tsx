import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });
  }, []);

  if (authed === null) return null; // splash hold
  return authed ? <Redirect href="/(tabs)/feed" /> : <Redirect href="/onboarding" />;
}
