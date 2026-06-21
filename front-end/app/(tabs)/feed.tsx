import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import { getFeed, type TripSummary } from '@/lib/api';
import TripCard from '@/components/feed/TripCard';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const startNewDay = useTrekStore((s) => s.startNewDay);

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getFeed();
      setTrips(data.trips);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch each time the tab gains focus so newly shared trips appear.
  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load])
  );

  function handleNewDay() {
    startNewDay();
    router.push('/plan');
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>trek</Text>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>P</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={Colors.coral} />}
      >
        <TouchableOpacity style={styles.ctaCard} onPress={handleNewDay} activeOpacity={0.85}>
          <Text style={styles.ctaEmoji}>＋</Text>
          <View>
            <Text style={styles.ctaTitle}>Plan a new day</Text>
            <Text style={styles.ctaSub}>Build your perfect LA itinerary</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Shared days</Text>

        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : trips.length === 0 ? (
          <Text style={styles.empty}>No shared trips yet. Build a day and share it to the feed!</Text>
        ) : (
          trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              showAuthor
              onPress={() => router.push(`/trip/${trip.id}`)}
              onAuthorPress={trip.user?.id ? () => router.push(`/user/${trip.user!.id}`) : undefined}
            />
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  logo: { fontSize: 26, fontWeight: '700', color: Colors.coral, letterSpacing: -0.5 },
  avatarBtn: {},
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.coral,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: Colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaEmoji: { fontSize: 28, color: '#fff', fontWeight: '300' },
  ctaTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ctaSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.soft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  empty: { color: Colors.soft, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
});