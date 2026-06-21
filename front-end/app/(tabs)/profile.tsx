import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import { getMyTrips, type TripSummary } from '@/lib/api';
import TripCard from '@/components/feed/TripCard';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getMyTrips();
      setTrips(data.trips);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your trips.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load])
  );

  const sharedCount = trips.filter((t) => t.is_public).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>P</Text>
        </View>
        <View>
          <Text style={styles.name}>Your trips</Text>
          <Text style={styles.sub}>
            {trips.length} saved · {sharedCount} shared
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={Colors.coral} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : trips.length === 0 ? (
          <Text style={styles.empty}>No trips yet. Plan a day to see it here.</Text>
        ) : (
          trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} showPrivacy onPress={() => router.push(`/trip/${trip.id}`)} />
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 20 },
  name: { fontFamily: 'serif', fontWeight: '700', fontSize: 24, color: Colors.ink, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: Colors.soft, marginTop: 2, fontWeight: '600' },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  empty: { color: Colors.soft, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
});
