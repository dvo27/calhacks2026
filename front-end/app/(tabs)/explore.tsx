import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import Chip from '@/components/ui/Chip';
import {
  getPlaceSuggestions,
  getExploreFeed,
  type PlaceSuggestion,
  type ExploreTrip,
} from '@/lib/api';

const CATEGORIES = ['All', 'Food', 'Shopping', 'Nightlife', 'Attractions'] as const;
type Category = (typeof CATEGORIES)[number];

const CAT_EMOJI: Record<string, string> = {
  food: '\u{1F37D}',
  shopping: '\u{1F6CD}',
  nightlife: '\u{1F378}',
  attractions: '\u{1F3DB}',
};

const CAT_GRADIENTS: Record<string, [string, string]> = {
  food: ['#FFB37A', '#FF6F61'],
  shopping: ['#FFA8C5', '#C56BD6'],
  nightlife: ['#7C6BE0', '#3B3170'],
  attractions: ['#5AC8C0', '#2E7DA8'],
};

function formatDistance(meters: number) {
  const miles = meters / 1609.34;
  return miles < 0.1 ? '<0.1 mi' : `${miles.toFixed(1)} mi`;
}

function formatDriveTime(minutes: number | null) {
  if (!minutes) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function PlaceCard({ place }: { place: PlaceSuggestion }) {
  const bg = CAT_GRADIENTS[place.category] ?? CAT_GRADIENTS.attractions;
  const emoji = CAT_EMOJI[place.category] ?? '\u{1F4CD}';

  return (
    <View style={styles.placeCard}>
      <View style={[styles.placePhoto, { backgroundColor: bg[0] }]}>
        <Text style={styles.placeEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
      <Text style={styles.placeMeta} numberOfLines={1}>
        {place.subcategory ?? place.category}
        {place.priceTier ? ` · ${'$'.repeat(place.priceTier)}` : ''}
      </Text>
      <Text style={styles.placeDist}>{formatDistance(place.distanceMeters)}</Text>
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: ExploreTrip; onPress: () => void }) {
  const author = trip.user;
  const initial = author?.username?.[0]?.toUpperCase() ?? '?';
  const activityCount = trip.activities?.length ?? 0;
  const totalEngagement = trip.engagement.likes + trip.engagement.comments + trip.engagement.shares;

  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.tripTop}>
        <View style={styles.tripAvatar}>
          <Text style={styles.tripAvatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.tripMeta}>
            {author?.username ? `@${author.username}` : 'Anonymous'}
            {' · '}
            {activityCount} stop{activityCount !== 1 ? 's' : ''}
            {' · '}
            {timeAgo(trip.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.tripStats}>
        <View style={styles.tripStat}>
          <Text style={styles.tripStatValue}>{formatDriveTime(trip.total_drive_time_minutes)}</Text>
          <Text style={styles.tripStatLabel}>drive</Text>
        </View>
        <View style={styles.tripStat}>
          <Text style={styles.tripStatValue}>${trip.total_budget ?? 0}</Text>
          <Text style={styles.tripStatLabel}>budget</Text>
        </View>
        <View style={styles.tripStat}>
          <Text style={styles.tripStatValue}>${trip.total_gas_cost ?? 0}</Text>
          <Text style={styles.tripStatLabel}>gas</Text>
        </View>
        <View style={styles.tripStat}>
          <Text style={styles.tripStatValue}>{trip.total_distance_miles ?? 0}mi</Text>
          <Text style={styles.tripStatLabel}>miles</Text>
        </View>
      </View>

      {trip.activities.length > 0 && (
        <View style={styles.tripStops}>
          {trip.activities.slice(0, 3).map((act, i) => (
            <View key={act.id} style={styles.tripStopChip}>
              <Text style={styles.tripStopText}>{i + 1}. {act.title}</Text>
            </View>
          ))}
          {trip.activities.length > 3 && (
            <Text style={styles.tripMoreStops}>+{trip.activities.length - 3} more</Text>
          )}
        </View>
      )}

      <View style={styles.tripEngagement}>
        <Text style={styles.engagementText}>{'❤'} {trip.engagement.likes}</Text>
        <Text style={styles.engagementText}>{'\u{1F4AC}'} {trip.engagement.comments}</Text>
        <Text style={styles.engagementText}>{'\u{1F516}'} {trip.engagement.shares}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeCat, setActiveCat] = useState<Category>('All');
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [trips, setTrips] = useState<ExploreTrip[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const catQuery = activeCat === 'All' ? '' : activeCat.toLowerCase();

    const [placesResult, tripsResult] = await Promise.allSettled([
      getPlaceSuggestions('Los Angeles, CA', catQuery, undefined, 8000, 12),
      getExploreFeed(),
    ]);

    if (placesResult.status === 'fulfilled') {
      setPlaces(placesResult.value.places);
    }
    if (tripsResult.status === 'fulfilled') {
      let sorted = [...tripsResult.value.trips];
      sorted.sort(
        (a, b) =>
          b.engagement.likes + b.engagement.comments + b.engagement.shares -
          (a.engagement.likes + a.engagement.comments + a.engagement.shares)
      );
      if (activeCat !== 'All') {
        const catLower = activeCat.toLowerCase();
        sorted = sorted.filter((t) =>
          t.activities.some(
            (act) =>
              act.tags?.some((tag) => tag.toLowerCase().includes(catLower)) ||
              act.title.toLowerCase().includes(catLower)
          )
        );
      }
      setTrips(sorted);
    }

    setLoadingPlaces(false);
    setLoadingTrips(false);
  }, [activeCat]);

  useEffect(() => {
    setLoadingPlaces(true);
    setLoadingTrips(true);
    fetchData();
  }, [fetchData]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  function handleCat(cat: Category) {
    setActiveCat(cat);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <TouchableOpacity style={styles.searchBtn}>
          <Text style={{ fontSize: 18 }}>{'\u{1F50D}'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
      >
        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              active={activeCat === cat}
              onPress={() => handleCat(cat)}
            />
          ))}
        </ScrollView>

        {/* Popular near you */}
        <Text style={styles.sectionTitle}>Popular near you</Text>
        <Text style={styles.sectionSub}>Spots people are loving right now</Text>

        {loadingPlaces ? (
          <ActivityIndicator color={Colors.coral} style={{ marginVertical: 20 }} />
        ) : places.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyEmoji}>{'\u{1F4CD}'}</Text>
            <Text style={styles.emptyText}>No places found nearby</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.placesRow}
          >
            {places.map((place, i) => (
              <PlaceCard key={`${place.osmId}-${i}`} place={place} />
            ))}
          </ScrollView>
        )}

        {/* Trending trips */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Trending trips</Text>
        <Text style={styles.sectionSub}>See what others are planning</Text>

        {loadingTrips ? (
          <ActivityIndicator color={Colors.coral} style={{ marginVertical: 20 }} />
        ) : trips.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyEmoji}>{'\u{1F5FA}'}</Text>
            <Text style={styles.emptyText}>No trips yet{' '}— be the first to share one!</Text>
          </View>
        ) : (
          trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => router.push(`/post/${trip.id}`)}
            />
          ))
        )}

        <View style={{ height: 30 }} />
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
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.3,
  },
  searchBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  chips: { gap: 8, marginBottom: 20, paddingRight: 18 },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 13,
    color: Colors.soft,
    marginTop: 2,
    marginBottom: 12,
  },

  // Places row
  placesRow: { gap: 12, paddingRight: 18, paddingBottom: 4 },
  placeCard: {
    width: 140,
    backgroundColor: Colors.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  placePhoto: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeEmoji: { fontSize: 32 },
  placeName: {
    fontWeight: '700',
    fontSize: 14,
    color: Colors.ink,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  placeMeta: {
    fontSize: 11,
    color: Colors.soft,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  placeDist: {
    fontSize: 11,
    color: Colors.soft,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginTop: 4,
  },

  // Trip cards
  tripCard: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  tripTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tripAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tripTitle: {
    fontWeight: '700',
    fontSize: 17,
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  tripMeta: {
    fontSize: 12,
    color: Colors.soft,
    marginTop: 2,
  },
  tripStats: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  tripStat: {},
  tripStatValue: { fontWeight: '700', fontSize: 16, color: Colors.ink },
  tripStatLabel: { fontSize: 10, color: Colors.soft, marginTop: 1 },
  tripStops: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tripStopChip: {
    backgroundColor: '#F1F2EC',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tripStopText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink2,
  },
  tripMoreStops: {
    fontSize: 11,
    color: Colors.soft,
    alignSelf: 'center',
    marginLeft: 2,
  },
  tripEngagement: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  engagementText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink2,
  },

  // Empty states
  emptySection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D7D8D1',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: { fontSize: 13, color: Colors.soft, marginTop: 6 },
});
