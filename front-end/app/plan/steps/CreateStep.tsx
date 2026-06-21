import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import { addTripActivity, createTrip, PlaceSuggestion } from '@/lib/api';
import SearchPlaceInput from '@/components/discover/SearchPlaceInput';
import TagRow from '@/components/discover/TagRow';
import DiscoverMap, { MapCandidate } from '@/components/map/DiscoverMap';
import DropPinSheet, { DropPinResult } from '@/components/discover/DropPinSheet';

const DEFAULT_REGION = { latitude: 34.0900, longitude: -118.3617 }; // TODO: geocode store.exploreArea

let stopCounter = 0;
function nextStopId() {
  stopCounter += 1;
  return `stop-${Date.now()}-${stopCounter}`;
}

export default function CreateStep() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tripId = useTrekStore((s) => s.tripId);
  const setTripId = useTrekStore((s) => s.setTripId);
  const exploreArea = useTrekStore((s) => s.exploreArea);
  const startLocation = useTrekStore((s) => s.startLocation);
  const stops = useTrekStore((s) => s.stops);
  const addStop = useTrekStore((s) => s.addStop);
  const removeStop = useTrekStore((s) => s.removeStop);
  const setPlanStep = useTrekStore((s) => s.setPlanStep);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');

  // search results shown as unconfirmed "+" pins on the map until tapped
  const [candidates, setCandidates] = useState<PlaceSuggestion[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ latitude: number; longitude: number } | null>(null);

  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const totalCost = stops.reduce((sum: number, s: any) => sum + (s.cost || 0), 0);

  async function ensureTripExists() {
    if (tripId) return tripId;
    try {
      const { trip } = await createTrip(exploreArea ? `${exploreArea} day` : 'New day');
      setTripId(trip.id);
      return trip.id;
    } catch (err) {
      console.warn('Failed to create trip lazily', err);
      return null;
    }
  }

  async function persistActivity(opts: { name: string; lat: number; lng: number; cat: string; cost: number; locationName?: string }) {
    const id = await ensureTripExists();
    if (!id) return;
    try {
      await addTripActivity(id, {
        title: opts.name,
        cost: opts.cost,
        location_name: opts.locationName ?? opts.name,
        tags: [opts.cat],
        location_coords: { lat: opts.lat, lng: opts.lng },
      });
    } catch (err) {
      console.warn('Failed to persist activity to backend', err);
    }
  }

  function handleResults(places: PlaceSuggestion[]) {
    setCandidates(places);
  }

  function handleCandidatePress(candidate: MapCandidate) {
    // already added → ignore (the numbered pin handles deselection on tap)
    if (stops.some((s: any) => s.id === candidate.id)) return;

    const match = candidates.find((c) => `${c.osmType}-${c.osmId}` === candidate.id);
    if (!match) return;

    // Keep the candidate in the list so removing the stop reverts it to a "+" pin.
    // DiscoverMap hides the "+" while it's an active stop, so it never double-renders.
    addStop({
      id: candidate.id,
      name: match.name,
      lat: match.lat,
      lng: match.lng,
      cat: match.category || (categoryFilter !== 'all' ? categoryFilter : 'food'),
      cost: 0,
      dur: 45,
    } as any);

    persistActivity({
      name: match.name,
      lat: match.lat,
      lng: match.lng,
      cat: match.category,
      cost: 0,
      locationName: match.displayAddress ?? undefined,
    });
  }

  // tap an added (numbered) pin to deselect → removes it from the itinerary
  function handleStopPress(stop: { id: string }) {
    removeStop(stop.id);
  }

  function handleLongPress(coord: { latitude: number; longitude: number }) {
    setPendingCoord(coord);
    setSheetOpen(true);
  }

  function handleConfirmDrop(result: DropPinResult) {
    if (pendingCoord) {
      addStop({
        id: nextStopId(),
        name: result.name,
        lat: pendingCoord.latitude,
        lng: pendingCoord.longitude,
        cat: result.cat,
        cost: result.cost,
        dur: result.dur,
        custom: true,
      } as any);

      persistActivity({
        name: result.name,
        lat: pendingCoord.latitude,
        lng: pendingCoord.longitude,
        cat: result.cat,
        cost: result.cost,
      });
    }
    setSheetOpen(false);
    setPendingCoord(null);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.kicker}>Build your day</Text>
          <Text style={styles.title}>Search & drop pins</Text>
        </View>
      </View>

      <SearchPlaceInput
        locationQuery={startLocation || exploreArea}
        onResults={handleResults}
        onDeviceLocationResolved={(origin) => setCurrentLocation(origin)}
        onSearchOriginResolved={(origin) => setFocusPoint({ latitude: origin.lat, longitude: origin.lng })}
      />

      <TagRow
        categoryFilter={categoryFilter}
        priceFilter={priceFilter}
        onCategoryChange={setCategoryFilter}
        onPriceChange={setPriceFilter}
      />

      <DiscoverMap
        stops={stops.map((s: any) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }))}
        candidates={candidates.map((c) => ({ id: `${c.osmType}-${c.osmId}`, name: c.name, lat: c.lat, lng: c.lng }))}
        initialRegion={DEFAULT_REGION}
        currentLocation={currentLocation}
        focusPoint={focusPoint}
        onLongPress={handleLongPress}
        onCandidatePress={handleCandidatePress}
        onStopPress={handleStopPress}
      />

      <View style={[styles.tray, { paddingBottom: insets.bottom + 10 }]}>
        <View>
          <Text style={styles.trayCount}>
            {stops.length} stop{stops.length === 1 ? '' : 's'}
            {totalCost > 0 ? `  ·  $${totalCost}` : ''}
          </Text>
          <Text style={styles.traySub}>your day so far</Text>
        </View>
        <TouchableOpacity
          style={[styles.viewPlanBtn, stops.length === 0 && styles.viewPlanBtnDisabled]}
          disabled={stops.length === 0}
          onPress={() => setPlanStep('plan')}
        >
          <Text style={styles.viewPlanText}>View plan →</Text>
        </TouchableOpacity>
      </View>

      <DropPinSheet
        visible={sheetOpen}
        coordLabel={pendingCoord ? `${pendingCoord.latitude.toFixed(4)}, ${pendingCoord.longitude.toFixed(4)}` : undefined}
        onCancel={() => {
          setSheetOpen(false);
          setPendingCoord(null);
        }}
        onConfirm={handleConfirmDrop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.ink },
  kicker: { fontSize: 12, color: Colors.soft, fontWeight: '600' },
  title: { fontFamily: 'serif', fontWeight: '700', fontSize: 24, color: Colors.ink, letterSpacing: -0.4 },
  tray: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.paper, paddingHorizontal: 18, paddingTop: 14,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#14162C', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 6,
  },
  trayCount: { fontWeight: '700', fontSize: 17, color: Colors.ink },
  traySub: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  viewPlanBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13 },
  viewPlanBtnDisabled: { backgroundColor: '#FFE7DF' },
  viewPlanText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
