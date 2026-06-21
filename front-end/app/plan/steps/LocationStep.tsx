import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import TagRow from '@/components/discover/TagRow';
import DiscoverMap from '@/components/map/DiscoverMap';
import DropPinSheet, { DropPinResult } from '@/components/discover/DropPinSheet';
import type { StopCat } from '@/lib/types';

const PLACES = [
  { id: 'p1',  name: 'Erewhon Market',       address: 'Silver Lake · 711 Sunset Blvd',      cat: 'food'        as StopCat, price: '$$$', cost: 55, lat: 34.0778, lng: -118.2754 },
  { id: 'p2',  name: 'Verve Coffee',          address: 'Melrose · 8410 Melrose Ave',         cat: 'food'        as StopCat, price: '$$',  cost: 18, lat: 34.0837, lng: -118.3522 },
  { id: 'p3',  name: 'LACMA',                 address: 'Mid-Wilshire · 5905 Wilshire Blvd',  cat: 'attractions' as StopCat, price: '$$',  cost: 25, lat: 34.0639, lng: -118.3593 },
  { id: 'p4',  name: 'The Grove',             address: 'Fairfax · 189 The Grove Dr',         cat: 'shopping'    as StopCat, price: '$$',  cost: 28, lat: 34.0722, lng: -118.3563 },
  { id: 'p5',  name: 'Griffith Observatory',  address: 'Los Feliz · 2800 E Observatory Rd',  cat: 'attractions' as StopCat, price: 'Free',cost: 0,  lat: 34.1184, lng: -118.3004 },
  { id: 'p6',  name: 'Night + Market',        address: 'WeHo · 9043 Sunset Blvd',           cat: 'food'        as StopCat, price: '$$$', cost: 55, lat: 34.0904, lng: -118.3871 },
  { id: 'p7',  name: 'Salt & Straw',          address: 'Larchmont · 240 N Larchmont Blvd',  cat: 'food'        as StopCat, price: '$$',  cost: 14, lat: 34.0777, lng: -118.3275 },
  { id: 'p8',  name: 'The Abbey',             address: 'WeHo · 692 N Robertson Blvd',       cat: 'nightlife'   as StopCat, price: '$$',  cost: 28, lat: 34.0840, lng: -118.3827 },
  { id: 'p9',  name: 'Runyon Canyon',         address: 'Hollywood · 2000 N Fuller Ave',     cat: 'attractions' as StopCat, price: 'Free',cost: 0,  lat: 34.1015, lng: -118.3548 },
  { id: 'p10', name: 'Melrose Trading Post',  address: 'Fairfax · 7850 Melrose Ave',        cat: 'shopping'    as StopCat, price: '$',   cost: 12, lat: 34.0842, lng: -118.3538 },
  { id: 'p11', name: 'The Broad',             address: 'DTLA · 221 S Grand Ave',            cat: 'attractions' as StopCat, price: 'Free',cost: 0,  lat: 34.0543, lng: -118.2501 },
  { id: 'p12', name: 'Sqirl',                 address: 'Silver Lake · 720 N Virgil Ave',    cat: 'food'        as StopCat, price: '$$',  cost: 22, lat: 34.0866, lng: -118.2900 },
  { id: 'p13', name: 'Employees Only',        address: 'WeHo · 7953 Santa Monica Blvd',    cat: 'nightlife'   as StopCat, price: '$$$', cost: 45, lat: 34.0908, lng: -118.3681 },
  { id: 'p14', name: 'Paramount Pictures',    address: 'Hollywood · 5515 Melrose Ave',      cat: 'attractions' as StopCat, price: '$$',  cost: 55, lat: 34.0839, lng: -118.3239 },
  { id: 'p15', name: 'Wax Museum',            address: 'Hollywood · 6767 Hollywood Blvd',   cat: 'attractions' as StopCat, price: '$$',  cost: 30, lat: 34.1020, lng: -118.3408 },
];

const EMO: Record<StopCat, string> = {
  food: '🍽', shopping: '🛍', nightlife: '🎸', attractions: '🗺',
};

const CAT_BG: Record<StopCat, string> = {
  food: '#FFE8DC', shopping: '#F8E0FF', nightlife: '#E4E0FF', attractions: '#D8F4F0',
};

let _cnt = 0;
function uid() { return `pin-${Date.now()}-${++_cnt}`; }

const DEFAULT_REGION = { latitude: 34.0522, longitude: -118.2437 };

export default function LocationStep() {
  const insets = useSafeAreaInsets();

  const stops = useTrekStore((s) => s.stops);
  const addStop = useTrekStore((s) => s.addStop);
  const clearStops = useTrekStore((s) => s.clearStops);
  const setPlanStep = useTrekStore((s) => s.setPlanStep);

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dropVisible, setDropVisible] = useState(false);

  const addedIds = new Set(stops.map((s) => s.id));

  const results = PLACES.filter((p) => {
    const q = query.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || p.cat.includes(q);
    const matchCat = catFilter === 'all' || p.cat === catFilter;
    const matchPrice = priceFilter === 'all' || p.price === priceFilter;
    return matchQ && matchCat && matchPrice;
  });

  function handleAdd(p: typeof PLACES[0]) {
    if (addedIds.has(p.id)) return;
    addStop({
      id: p.id,
      name: p.name,
      address: p.address,
      cat: p.cat,
      price: p.cost,
      dur: p.cat === 'attractions' ? 75 : p.cat === 'nightlife' ? 90 : 60,
      lat: p.lat,
      lng: p.lng,
    });
  }

  function handleLongPress(coord: { latitude: number; longitude: number }) {
    setPendingCoord(coord);
    setDropVisible(true);
  }

  function handleConfirmDrop(result: DropPinResult) {
    if (!pendingCoord) return;
    addStop({
      id: uid(),
      name: result.name,
      address: `${pendingCoord.latitude.toFixed(4)}, ${pendingCoord.longitude.toFixed(4)}`,
      cat: result.cat as StopCat,
      price: result.cost,
      dur: result.dur,
      lat: pendingCoord.latitude,
      lng: pendingCoord.longitude,
    });
    setPendingCoord(null);
    setDropVisible(false);
  }

  const mapStops = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng! }));

  const totalCost = stops.reduce((sum, s) => sum + s.price, 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>Build your day</Text>
            <Text style={styles.title}>Search & drop pins</Text>
          </View>
        </View>

        {/* search bar */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder='Try "coffee WeHo" or "museum DTLA"'
            placeholderTextColor={Colors.soft}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* filter chips */}
        <TagRow
          categoryFilter={catFilter}
          priceFilter={priceFilter}
          onCategoryChange={setCatFilter}
          onPriceChange={setPriceFilter}
        />

        {/* map */}
        <View style={styles.mapWrap}>
          <DiscoverMap
            stops={mapStops}
            initialRegion={DEFAULT_REGION}
            onLongPress={handleLongPress}
          />
        </View>

        {/* results */}
        <FlatList
          data={results.slice(0, 8)}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No places match. Try another search or long-press map to drop a pin.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const added = addedIds.has(item.id);
            return (
              <View style={styles.resultRow}>
                <View style={[styles.placeIcon, { backgroundColor: CAT_BG[item.cat] }]}>
                  <Text style={styles.placeEmoji}>{EMO[item.cat]}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.placeMeta} numberOfLines={1}>{item.address} · {item.price}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, added && styles.addBtnDone]}
                  onPress={() => handleAdd(item)}
                  disabled={added}
                >
                  <Text style={[styles.addBtnText, added && styles.addBtnDoneText]}>
                    {added ? '✓' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />

        {/* bottom tray */}
        <View style={[styles.tray, { paddingBottom: insets.bottom + 10 }]}>
          <View>
            <Text style={styles.trayCount}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
              {totalCost > 0 ? `  ·  $${totalCost}` : ''}
            </Text>
            <Text style={styles.traySub}>your day so far</Text>
          </View>
          <TouchableOpacity
            style={[styles.viewBtn, stops.length === 0 && styles.viewBtnDisabled]}
            disabled={stops.length === 0}
            onPress={() => setPlanStep('plan')}
          >
            <Text style={styles.viewBtnText}>View plan →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DropPinSheet
        visible={dropVisible}
        coordLabel={
          pendingCoord
            ? `${pendingCoord.latitude.toFixed(4)}, ${pendingCoord.longitude.toFixed(4)}`
            : undefined
        }
        onCancel={() => { setDropVisible(false); setPendingCoord(null); }}
        onConfirm={handleConfirmDrop}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  backIcon: { fontSize: 24, color: Colors.ink, lineHeight: 28 },
  kicker: { fontSize: 12, color: Colors.soft, fontWeight: '600' },
  title: { fontWeight: '700', fontSize: 22, color: Colors.ink, letterSpacing: -0.4 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 18, marginBottom: 2,
    backgroundColor: Colors.paper,
    borderRadius: 16, paddingLeft: 14, paddingRight: 10,
    borderWidth: 1, borderColor: Colors.line,
    shadowColor: '#14162C', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.ink },
  clearBtn: { padding: 6 },
  clearText: { color: Colors.soft, fontSize: 13 },

  mapWrap: {
    height: 200, marginTop: 10, marginHorizontal: 18,
    borderRadius: 16, overflow: 'hidden',
  },

  list: { flex: 1, paddingHorizontal: 18, marginTop: 8 },
  emptyWrap: { paddingTop: 24, alignItems: 'center' },
  emptyText: { color: Colors.soft, fontSize: 13, textAlign: 'center' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  placeIcon: {
    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  placeEmoji: { fontSize: 20 },
  placeName: { fontWeight: '700', fontSize: 14, color: Colors.ink },
  placeMeta: { fontSize: 11, color: Colors.soft, marginTop: 2 },

  addBtn: {
    borderWidth: 1.5, borderColor: Colors.coral, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0,
  },
  addBtnDone: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  addBtnText: { fontWeight: '700', fontSize: 13, color: Colors.coral },
  addBtnDoneText: { color: '#fff' },

  tray: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.paper, paddingHorizontal: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.line,
    shadowColor: '#14162C', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
  },
  trayCount: { fontWeight: '700', fontSize: 17, color: Colors.ink },
  traySub: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  viewBtn: {
    backgroundColor: Colors.coral, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 13,
  },
  viewBtnDisabled: { backgroundColor: Colors.coralSoft },
  viewBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
