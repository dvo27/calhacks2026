import { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { getPlaceSuggestions, PlaceSuggestion } from '@/lib/api';
import * as Location from 'expo-location';

const DEFAULT_LOCATION_QUERY = 'Los Angeles, CA';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
}

interface SearchPlaceInputProps {
  locationQuery: string;
  onResults: (places: PlaceSuggestion[]) => void; // fired whenever a search returns — drives map pins
  onDeviceLocationResolved?: (origin: { latitude: number; longitude: number }) => void;
  onSearchOriginResolved?: (origin: { displayName: string; lat: number; lng: number }) => void;
}

export default function SearchPlaceInput({
  locationQuery,
  onResults,
  onDeviceLocationResolved,
  onSearchOriginResolved,
}: SearchPlaceInputProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'granted' | 'denied'>('loading');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRunRef = useRef(0);
  const originCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const onDeviceLocationResolvedRef = useRef(onDeviceLocationResolved);
  const onSearchOriginResolvedRef = useRef(onSearchOriginResolved);

  useEffect(() => {
    onDeviceLocationResolvedRef.current = onDeviceLocationResolved;
    onSearchOriginResolvedRef.current = onSearchOriginResolved;
  }, [onDeviceLocationResolved, onSearchOriginResolved]);

  useEffect(() => {
    let cancelled = false;

    async function requestLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (permission.status !== 'granted') {
          setLocationStatus('denied');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        originCoordsRef.current = coords;
        onDeviceLocationResolvedRef.current?.(coords);
        setLocationStatus('granted');
      } catch (error) {
        if (!cancelled) {
          console.warn('Location permission request failed', error);
          setLocationStatus('denied');
        }
      }
    }

    requestLocation();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      searchRunRef.current += 1;
      onResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(text), 400);
  }

  async function runSearch(text: string) {
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    setLoading(true);
    try {
      const originQuery = locationQuery.trim() || DEFAULT_LOCATION_QUERY;
      const searchQuery = text.trim();
      const radii = [900, 1800, 3600, 7200];
      const seen = new Map<string, PlaceSuggestion>();
      const originCoords = originCoordsRef.current ?? undefined;

      onResults([]);

      for (const radiusMeters of radii) {
        if (searchRunRef.current !== runId) {
          return;
        }

        const data = await getPlaceSuggestions(originQuery, searchQuery, originCoords, radiusMeters, 8);
        if (radiusMeters === radii[0]) {
          onSearchOriginResolvedRef.current?.(data.origin);
        }
        for (const place of data.places) {
          const key = `${place.osmType}-${place.osmId}`;
          if (!seen.has(key)) {
            seen.set(key, place);
          }
        }

        if (searchRunRef.current !== runId) {
          return;
        }

        onResults([...seen.values()]);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    } catch (err) {
      if (searchRunRef.current === runId) {
        console.warn('Place suggestions failed', err);
        onResults([]);
      }
    } finally {
      if (searchRunRef.current === runId) {
        setLoading(false);
      }
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <Text style={styles.icon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder='Try "food in 90210" or "coffee near me"'
          placeholderTextColor={Colors.soft}
          value={query}
          onChangeText={handleChangeText}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => query.trim() && runSearch(query)}>
          <Text style={styles.searchBtnText}>{loading ? '…' : 'Search'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.locationHint}>
        {locationStatus === 'granted'
          ? 'Using your current location'
          : locationStatus === 'denied'
            ? 'Location access denied. Searches will fall back to your trip area.'
            : 'Requesting your location...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paper,
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 6,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  icon: { fontSize: 15, marginRight: 8, color: Colors.soft },
  input: { flex: 1, paddingVertical: 14, fontSize: 14, color: Colors.ink },
  searchBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  locationHint: { marginTop: 8, marginLeft: 2, fontSize: 12, color: Colors.soft, fontWeight: '600' },
});
