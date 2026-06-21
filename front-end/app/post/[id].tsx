import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/trip/${id}`);
  }, [id, router]);

  return null;
}
