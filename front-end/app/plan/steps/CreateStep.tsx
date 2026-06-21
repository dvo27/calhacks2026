import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import SearchPlaceInput, { PlaceResult } from '@/components/discover/SearchPlaceInput';
import TagRow from '@/components/discover/TagRow';
import DiscoverMap from '@/components/map/DiscoverMap';
import DropPinSheet, { DropPinResult } from '@/components/discover/DropPinSheet';

const DEFAULT_REGION = { latitude: 34.0900, longitude: -118.3617 }; // West Hollywood — TODO: geocode store.exploreArea

let stopCounter = 0;
function nextStopId() {
  stopCounter += 1;
  return `stop-${Date.now()}-${stopCounter}`;
}

export default function CreateStep() {
  const insets = useSafeAreaInsets();

  const stops = useTrekStore((s) => s.stops);
  const addStop = useTrekStore((s) => s.addStop);
  const setPlanStep = useTrekStore((s) => s.setPlanStep);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');

  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const totalCost = stops.reduce((sum: number, s: any) => sum + (s.cost || 0), 0);

  function handleSelectPlace(place: PlaceResult) {
    addStop({
      id: place.placeId,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      cat: categoryFilter !== 'all' ? categoryFilter : 'food',
      cost: 0,
      dur: 45,
    } as any);
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
    }
    setSheetOpen(false);
    setPendingCoord(null);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setPlanStep('acts')}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.kicker}>Build your day</Text>
          <Text style={styles.title}>Search & drop pins</Text>
        </View>
      </View>

      <SearchPlaceInput onSelect={handleSelectPlace} />

      <TagRow
        categoryFilter={categoryFilter}
        priceFilter={priceFilter}
        onCategoryChange={setCategoryFilter}
        onPriceChange={setPriceFilter}
      />

      <DiscoverMap
        stops={stops.map((s: any) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }))}
        initialRegion={DEFAULT_REGION}
        onLongPress={handleLongPress}
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
