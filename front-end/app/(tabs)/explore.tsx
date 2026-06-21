import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { getRecommendations, type RecommendationItem } from '@/lib/api';

const DEFAULT_LOCATION_QUERY = 'Current location';

function formatPriceTier(priceTier: number | null | undefined) {
  if (priceTier == null) return null;
  if (priceTier <= 0) return '$';
  return '$'.repeat(Math.min(priceTier, 4));
}

function buildGoogleMapsDirectionsUrl(stops: Array<{ lat: number; lng: number }>) {
  if (stops.length < 2) return null;

  const origin = `${stops[0].lat},${stops[0].lng}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`;
  const waypoints = stops
    .slice(1, -1)
    .map((stop) => `${stop.lat},${stop.lng}`)
    .join('|');

  const params = [
    `api=1`,
    `travelmode=driving`,
    `origin=${encodeURIComponent(origin)}`,
    `destination=${encodeURIComponent(destination)}`,
    `dir_action=navigate`,
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : null,
  ]
    .filter(Boolean)
    .join('&');

  return `https://www.google.com/maps/dir/?${params}`;
}

function buildAppleMapsUrl(title: string, lat: number, lng: number) {
  const query = encodeURIComponent(title.trim() || `${lat},${lng}`);
  return `http://maps.apple.com/?ll=${lat},${lng}&q=${query}`;
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [headline, setHeadline] = useState('Top picks near you');
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled || permission.status !== 'granted') return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (err) {
        console.warn('Location permission request failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadRecommendations() {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecommendations(locationQuery.trim() || DEFAULT_LOCATION_QUERY, query.trim(), origin ?? undefined, 5000, 8);
      setHeadline(data.headline);
      setItems(data.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!origin) return;
    const timer = setTimeout(() => {
      void loadRecommendations();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, locationQuery, query]);

  const subtitle = useMemo(() => {
    if (origin) return 'Using your current location';
    return 'Search by vibe, area, or neighborhood';
  }, [origin]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>explore</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.label}>Where</Text>
        <TextInput
          style={styles.input}
          value={locationQuery}
          onChangeText={setLocationQuery}
          placeholder="Current location"
          placeholderTextColor={Colors.soft}
        />
        <Text style={styles.label}>What</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder='Try "coffee", "date night", or "hike"'
          placeholderTextColor={Colors.soft}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={loadRecommendations} activeOpacity={0.85}>
          <Text style={styles.searchBtnText}>{loading ? 'Finding…' : 'Show recommendations'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headlineRow}>
          <Text style={styles.headline}>{headline}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No recommendations yet. Try a broader search.</Text>
        ) : (
          items.map((item, index) => (
            <View key={`${item.kind}-${index}-${item.title}`} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.kind === 'trip' ? 'Trip idea' : 'Place'}</Text>
                </View>
                {item.price_tier ? (
                  <Text style={styles.price}>{formatPriceTier(item.price_tier)}</Text>
                ) : null}
              </View>

              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardReason}>{item.reason}</Text>

              {item.display_address ? <Text style={styles.meta}>{item.display_address}</Text> : null}

              {item.kind === 'trip' && item.stops?.length ? (
                <View style={styles.stopList}>
                  {item.stops.map((stop, stopIndex) => (
                    <View key={`${stop.title}-${stopIndex}`} style={styles.stopRow}>
                      <View style={styles.stopDot}>
                        <Text style={styles.stopDotText}>{stopIndex + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stopTitle}>{stop.title}</Text>
                        {stop.display_address ? <Text style={styles.stopMeta}>{stop.display_address}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {item.kind === 'trip' && item.stops?.length ? (
                <TouchableOpacity
                  style={styles.openBtn}
                  onPress={async () => {
                    const routeUrl = buildGoogleMapsDirectionsUrl(item.stops!.map((stop) => ({ lat: stop.lat, lng: stop.lng })));
                    if (routeUrl) {
                      await Linking.openURL(routeUrl);
                    }
                  }}
                >
                  <Text style={styles.openBtnText}>Open route</Text>
                </TouchableOpacity>
              ) : item.lat != null && item.lng != null ? (
                <TouchableOpacity
                  style={styles.openBtn}
                  onPress={() => {
                    void Linking.openURL(buildAppleMapsUrl(item.title, item.lat!, item.lng!));
                  }}
                >
                  <Text style={styles.openBtnText}>Open in Maps</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4 },
  logo: { fontSize: 28, fontWeight: '800', color: Colors.coral, letterSpacing: -0.6 },
  sub: { marginTop: 2, color: Colors.soft, fontSize: 12, fontWeight: '600' },
  searchCard: {
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: Colors.paper,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  label: { fontSize: 11, fontWeight: '700', color: Colors.soft, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
  },
  searchBtn: {
    marginTop: 14,
    backgroundColor: Colors.coral,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scroll: { paddingHorizontal: 18, paddingBottom: 24 },
  headlineRow: { marginBottom: 12 },
  headline: { fontWeight: '800', fontSize: 18, color: Colors.ink },
  empty: { color: Colors.soft, fontSize: 14, textAlign: 'center', marginTop: 20, lineHeight: 20 },
  card: {
    backgroundColor: Colors.paper,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    backgroundColor: '#F2EEF8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.ink2 },
  price: { fontSize: 13, fontWeight: '800', color: Colors.ink },
  cardTitle: { marginTop: 10, fontSize: 18, fontWeight: '800', color: Colors.ink },
  cardReason: { marginTop: 6, fontSize: 13, lineHeight: 19, color: Colors.ink2 },
  meta: { marginTop: 8, fontSize: 12, color: Colors.soft, fontWeight: '600' },
  stopList: { marginTop: 12, gap: 10 },
  stopRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stopDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stopDotText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  stopTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  stopMeta: { fontSize: 12, color: Colors.soft, marginTop: 1 },
  openBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: Colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
