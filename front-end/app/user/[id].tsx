import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { getUserById, followUser, unfollowUser, type TripSummary } from '@/lib/api';

function toNum(v: number | string | null | undefined) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string; username: string | null; avatar_url: string | null } | null>(null);
  const [stats, setStats] = useState<{ followers: number; following: number; trips: number } | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getUserById(id)
      .then((data) => {
        setProfile(data.profile);
        setStats(data.stats);
        setTrips(data.trips);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleFollow() {
    if (!id || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await unfollowUser(id);
      else await followUser(id);
    } catch {
      setFollowing(wasFollowing);
    } finally {
      setFollowBusy(false);
    }
  }

  const username = profile?.username ?? 'Anonymous';
  const initial = username[0]?.toUpperCase() ?? '?';

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.coral} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? 'User not found.'}</Text>
        <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
          <Text style={styles.backBtn2Text}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.username}>@{username}</Text>

          {stats ? (
            <View style={styles.statsRow}>
              <Stat value={stats.trips} label="trips" />
              <Stat value={stats.followers} label="followers" />
              <Stat value={stats.following} label="following" />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={handleFollow}
            disabled={followBusy}
            activeOpacity={0.8}
          >
            <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {trips.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Trips</Text>
            {trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripRow}
                activeOpacity={0.8}
                onPress={() => router.push(`/trip/${trip.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                  <Text style={styles.tripMeta}>
                    {trip.activities?.length ?? 0} stops
                    {trip.total_distance_miles ? ` · ${toNum(trip.total_distance_miles).toFixed(0)} mi` : ''}
                    {trip.total_budget ? ` · $${toNum(trip.total_budget).toFixed(0)}` : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.emptyTrips}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={styles.emptyText}>No public trips yet.</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.ink },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.ink },

  scroll: { paddingHorizontal: 18, paddingBottom: 8 },

  profileSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 32 },
  username: { fontSize: 20, fontWeight: '700', color: Colors.ink, marginBottom: 16 },

  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 20 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  statLabel: { fontSize: 11, color: Colors.soft, fontWeight: '600', marginTop: 2 },

  followBtn: {
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.coral,
  },
  followBtnActive: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.coral },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followBtnTextActive: { color: Colors.coral },

  sectionLabel: { fontWeight: '700', fontSize: 16, color: Colors.ink, marginBottom: 10, marginTop: 4 },

  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paper,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  tripTitle: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  tripMeta: { fontSize: 12, color: Colors.soft, marginTop: 3 },
  chevron: { fontSize: 22, color: Colors.soft, marginLeft: 8 },

  emptyTrips: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 14, color: Colors.soft },

  errorText: { fontSize: 15, color: Colors.soft, textAlign: 'center' },
  backBtn2: { backgroundColor: Colors.coral, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  backBtn2Text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
