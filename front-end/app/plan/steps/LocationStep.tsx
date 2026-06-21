import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import { getPlaceSuggestions, type PlaceSuggestion } from '@/lib/api';
import TagRow from '@/components/discover/TagRow';
import DiscoverMap from '@/components/map/DiscoverMap';
import DropPinSheet, { DropPinResult } from '@/components/discover/DropPinSheet';
import type { StopCat } from '@/lib/types';

// Foursquare search terms per category chip
const CAT_QUERY: Record<string, string> = {
  food: 'restaurant cafe food',
  shopping: 'shop store mall shopping',
  nightlife: 'bar nightlife club lounge',
  attractions: 'museum park attraction landmark',
};

function tierToPrice(tier: number | null): string {
  if (tier === 1) return '$';
  if (tier === 2) return '$$';
  if (tier === 3) return '$$$';
  if (tier === 4) return '$$$$';
  return 'Free';
}

function tierToCost(tier: number | null): number {
  if (tier === 1) return 12;
  if (tier === 2) return 25;
  if (tier === 3) return 50;
  if (tier === 4) return 80;
  return 0;
}

function matchesPrice(tier: number | null, filter: string): boolean {
  if (filter === 'all') return true;
  return tierToPrice(tier) === filter;
}

function toStopCat(cat: string): StopCat {
  if (cat.includes('food') || cat.includes('restaurant') || cat.includes('cafe') || cat.includes('bar')) return 'food';
  if (cat.includes('shop') || cat.includes('store') || cat.includes('mall')) return 'shopping';
  if (cat.includes('night') || cat.includes('club') || cat.includes('lounge')) return 'nightlife';
  return 'attractions';
}

type PlaceRow = {
  id: string;
  name: string;
  address: string;
  cat: StopCat;
  price: string;
  cost: number;
  lat: number;
  lng: number;
  priceTier: number | null;
};

function suggestionToRow(p: PlaceSuggestion): PlaceRow {
  return {
    id: `${p.osmType}-${p.osmId}`,
    name: p.name,
    address: p.displayAddress ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
    cat: toStopCat(p.category),
    price: tierToPrice(p.priceTier),
    cost: tierToCost(p.priceTier),
    lat: p.lat,
    lng: p.lng,
    priceTier: p.priceTier,
  };
}

const EMO: Record<StopCat, string> = {
  food: '🍽', shopping: '🛍', nightlife: '🎸', attractions: '🗺',
};

const CAT_BG: Record<StopCat, string> = {
  food: '#FFE8DC', shopping: '#F8E0FF', nightlife: '#E4E0FF', attractions: '#D8F4F0',
};

let _cnt = 0;
function uid() { return `pin-${Date.now()}-${++_cnt}`; }

const DEFAULT_REGION = { latitude: 34.0522, longitude: -118.2437 };

function buildSearchQuery(catFilter: string, textQuery: string): string {
  const catTerm = catFilter !== 'all' ? (CAT_QUERY[catFilter] ?? catFilter) : '';
  const q = textQuery.trim();
  // combine text query with category term so "thai" + food → "thai restaurant cafe food"
  if (q && catTerm) return `${q} ${catTerm}`;
  if (q) return q;
  if (catTerm) return catTerm;
  return 'things to do';
}

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
  const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [apiResults, setApiResults] = useState<PlaceRow[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setCurrentLocation(coords);
      setMapRegion(coords);
    })();
  }, []);

  const fetchPlaces = useCallback((catF: string, textQ: string, location: { latitude: number; longitude: number } | null) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoadingPlaces(true);
    setApiResults([]);
    const searchQuery = buildSearchQuery(catF, textQ);
    getPlaceSuggestions('', searchQuery, location ?? undefined, 5000, 20, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setApiResults(res.places.map(suggestionToRow));
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setLoadingPlaces(false); });
  }, []);

  // Fetch when category changes immediately
  useEffect(() => {
    fetchPlaces(catFilter, query, currentLocation);
    return () => { abortRef.current?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilter, currentLocation]);

  // Fetch on text change with 400ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPlaces(catFilter, query, currentLocation);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const addedIds = new Set(stops.map((s) => s.id));

  const results = apiResults.filter((p) => matchesPrice(p.priceTier, priceFilter));

  function handleAdd(p: PlaceRow) {
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
            initialRegion={mapRegion}
            currentLocation={currentLocation}
            onLongPress={handleLongPress}
          />
        </View>

        {/* results */}
        {loadingPlaces ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 16 }} />
        ) : (
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
        )}

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
