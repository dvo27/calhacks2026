import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { getTripTimeline, type TripTimelineResponse } from '@/lib/api';
import TripRouteMap, { TripRoutePoint } from '@/components/map/TripRouteMap';

const MPG = 25;
const GAS_PRICE_PER_GALLON = 4.5;
const AVG_SPEED_MPH = 30;
const METERS_PER_MILE = 1609.34;

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatClock(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function TripDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TripTimelineResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const result = await getTripTimeline(id);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trip.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const places = data?.places ?? [];

  const mapPoints: TripRoutePoint[] = useMemo(
    () =>
      places
        .filter((p) => p.coordinates)
        .map((p) => ({ id: p.id, name: p.title, latitude: p.coordinates!.latitude, longitude: p.coordinates!.longitude })),
    [places]
  );

  const stats = useMemo(() => {
    let meters = 0;
    for (let i = 1; i < mapPoints.length; i += 1) {
      meters += haversineMeters(mapPoints[i - 1], mapPoints[i]);
    }
    const miles = meters / METERS_PER_MILE;
    return {
      miles,
      gas: (miles / MPG) * GAS_PRICE_PER_GALLON,
      driveMinutes: (miles / AVG_SPEED_MPH) * 60,
      budget: places.reduce((sum, p) => sum + (p.cost || 0), 0),
    };
  }, [mapPoints, places]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.coral} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Couldn’t load trip</Text>
        <Text style={styles.emptySub}>{error ?? 'Trip not found.'}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const authorName = data.trip.user?.username ?? 'Someone';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{authorName}’s day</Text>
          <Text style={styles.title} numberOfLines={1}>{data.trip.title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {mapPoints.length > 0 ? (
          <TripRouteMap points={mapPoints} style={styles.map} />
        ) : (
          <View style={[styles.map, styles.center]}>
            <Text style={styles.emptySub}>No mapped locations.</Text>
          </View>
        )}

        <View style={styles.statRow}>
          <Stat label="Distance" value={`${stats.miles.toFixed(1)} mi`} />
          <Stat label="Drive time" value={`${Math.round(stats.driveMinutes)} min`} />
          <Stat label="Gas" value={`$${stats.gas.toFixed(2)}`} />
          <Stat label="Budget" value={`$${stats.budget.toFixed(0)}`} />
        </View>

        <Text style={styles.sectionLabel}>The route</Text>

        {places.map((place, index) => {
          const time = formatClock(place.startTime);
          return (
            <View key={place.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberBadgeText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{place.title}</Text>
                  {place.locationName ? (
                    <Text style={styles.address} numberOfLines={1}>{place.locationName}</Text>
                  ) : null}
                </View>
                {time ? <Text style={styles.time}>{time}</Text> : null}
              </View>

              {place.rating ? (
                <Text style={styles.rating}>
                  {'★'.repeat(place.rating)}
                  <Text style={styles.ratingOff}>{'★'.repeat(Math.max(0, 5 - place.rating))}</Text>
                </Text>
              ) : null}

              {place.description ? <Text style={styles.desc}>{place.description}</Text> : null}

              {place.media.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                  {place.media.map((m) => (
                    <Image key={m.id} source={{ uri: m.url }} style={styles.photo} />
                  ))}
                </ScrollView>
              ) : null}
            </View>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.ink },
  kicker: { fontSize: 12, color: Colors.soft, fontWeight: '600' },
  title: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink, letterSpacing: -0.4 },

  scroll: { paddingHorizontal: 18, paddingBottom: 8 },
  map: { height: 220, borderRadius: 18, marginTop: 4 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: Colors.paper, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 15, color: Colors.ink },
  statLabel: { fontSize: 11, color: Colors.soft, marginTop: 3, fontWeight: '600' },

  sectionLabel: { fontWeight: '700', fontSize: 16, color: Colors.ink, marginTop: 22, marginBottom: 10 },

  card: { backgroundColor: Colors.paper, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  numberBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  name: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  address: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  time: { fontWeight: '700', fontSize: 13, color: Colors.ink2 },
  rating: { marginTop: 10, fontSize: 16, color: Colors.amber, letterSpacing: 2 },
  ratingOff: { color: Colors.line },
  desc: { marginTop: 10, fontSize: 14, color: Colors.ink2, lineHeight: 20 },
  photoRow: { marginTop: 12 },
  photo: { width: 96, height: 96, borderRadius: 12, marginRight: 8, backgroundColor: Colors.line },

  emptyTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink },
  emptySub: { fontSize: 14, color: Colors.soft, textAlign: 'center' },
  primaryBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
