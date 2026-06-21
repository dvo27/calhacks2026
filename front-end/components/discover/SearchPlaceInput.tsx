import { useEffect, useRef, useState } from 'react';
import { AppState, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { Colors } from '@/constants/colors';
import { generateVoiceItinerary, getPlaceSuggestions, PlaceSuggestion } from '@/lib/api';

const DEFAULT_LOCATION_QUERY = 'Current location';
const SEARCH_RADIUS_METERS = 7200;
const SEARCH_LIMIT = 24;
const REVEAL_RADIUSES = [900, 1800, 3600, 7200];

const CAT_QUERY: Record<string, string> = {
  food: 'restaurant cafe food',
  shopping: 'shop store mall shopping',
  nightlife: 'bar nightlife club lounge',
  attractions: 'museum park attraction landmark',
};

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
  categoryFilter?: string;
  onResults: (places: PlaceSuggestion[]) => void;
  onDeviceLocationResolved?: (origin: { latitude: number; longitude: number }) => void;
  onSearchOriginResolved?: (origin: { displayName: string; lat: number; lng: number }) => void;
  onVoiceItineraryCreated?: (payload: {
    trip: { id: number; title: string };
    activities: Array<{
      title: string;
      location_name: string;
      lat: number;
      lng: number;
    }>;
  }) => void;
}

async function readRecordedAudioBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export default function SearchPlaceInput({
  locationQuery,
  categoryFilter = 'all',
  onResults,
  onDeviceLocationResolved,
  onSearchOriginResolved,
  onVoiceItineraryCreated,
}: SearchPlaceInputProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [locationStatus, setLocationStatus] = useState<'loading' | 'granted' | 'denied'>('loading');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRunRef = useRef(0);
  const activeSearchControllerRef = useRef<AbortController | null>(null);
  const recordingRef = useRef<InstanceType<typeof Audio.Recording> | null>(null);
  const originCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationReadyRef = useRef<Promise<void> | null>(null);
  const resolveLocationReadyRef = useRef<(() => void) | null>(null);
  const onDeviceLocationResolvedRef = useRef(onDeviceLocationResolved);
  const onSearchOriginResolvedRef = useRef(onSearchOriginResolved);
  const categoryFilterRef = useRef(categoryFilter);
  const categoryMountedRef = useRef(false);

  useEffect(() => {
    onDeviceLocationResolvedRef.current = onDeviceLocationResolved;
    onSearchOriginResolvedRef.current = onSearchOriginResolved;
  }, [onDeviceLocationResolved, onSearchOriginResolved]);

  useEffect(() => {
    categoryFilterRef.current = categoryFilter;
    if (!categoryMountedRef.current) {
      categoryMountedRef.current = true;
      return;
    }
    runSearch(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    locationReadyRef.current = new Promise<void>((resolve) => {
      resolveLocationReadyRef.current = resolve;
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        searchRunRef.current += 1;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        activeSearchControllerRef.current?.abort();
        activeSearchControllerRef.current = null;
      }
    });

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
      } finally {
        resolveLocationReadyRef.current?.();
        resolveLocationReadyRef.current = null;
      }
    }

    requestLocation();

    return () => {
      cancelled = true;
      resolveLocationReadyRef.current?.();
      resolveLocationReadyRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      activeSearchControllerRef.current?.abort();
      activeSearchControllerRef.current = null;
      recordingRef.current = null;
      appStateSubscription.remove();
    };
  }, []);

  function publishPlacesIncrementally(runId: number, places: PlaceSuggestion[], controller: AbortController) {
    const seen = new Map<string, PlaceSuggestion>();
    const stagedPlaces = [...places].sort((left, right) => left.distanceMeters - right.distanceMeters);

    return (async () => {
      for (const radiusMeters of REVEAL_RADIUSES) {
        if (searchRunRef.current !== runId || controller.signal.aborted || AppState.currentState !== 'active') {
          return;
        }

        for (const place of stagedPlaces) {
          if (place.distanceMeters > radiusMeters) continue;
          const key = `${place.osmType}-${place.osmId}`;
          if (!seen.has(key)) {
            seen.set(key, place);
          }
        }

        onResults([...seen.values()]);
        await new Promise((resolve) => setTimeout(resolve, 140));
      }
    })();
  }

  async function runSearch(text: string) {
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    activeSearchControllerRef.current?.abort();
    const controller = new AbortController();
    activeSearchControllerRef.current = controller;
    setLoading(true);

    try {
      if (AppState.currentState !== 'active') {
        return;
      }

      if (!originCoordsRef.current && locationStatus === 'loading' && locationReadyRef.current) {
        await locationReadyRef.current;
      }

      if (controller.signal.aborted || AppState.currentState !== 'active') {
        return;
      }

      const originQuery = locationQuery.trim() || DEFAULT_LOCATION_QUERY;
      const catTerm = CAT_QUERY[categoryFilterRef.current] ?? '';
      const textTerm = text.trim();
      const searchQuery = [textTerm, catTerm].filter(Boolean).join(' ') || 'things to do';
      const originCoords = originCoordsRef.current ?? undefined;

      onResults([]);

      const data = await getPlaceSuggestions(
        originQuery,
        searchQuery,
        originCoords,
        SEARCH_RADIUS_METERS,
        SEARCH_LIMIT,
        controller.signal
      );

      if (searchRunRef.current !== runId) {
        return;
      }

      onSearchOriginResolvedRef.current?.(data.origin);
      await publishPlacesIncrementally(runId, data.places, controller);
    } catch (error) {
      if (searchRunRef.current === runId && !controller.signal.aborted) {
        console.warn('Place suggestions failed', error);
        onResults([]);
      }
    } finally {
      if (searchRunRef.current === runId) {
        setLoading(false);
      }
      if (activeSearchControllerRef.current === controller) {
        activeSearchControllerRef.current = null;
      }
    }
  }

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

  async function startVoiceRecording() {
    if (voiceState !== 'idle') {
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        console.warn('Microphone permission denied.');
        return;
      }

      searchRunRef.current += 1;
      activeSearchControllerRef.current?.abort();
      activeSearchControllerRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setVoiceState('recording');
    } catch (error) {
      console.warn('Failed to start recording', error);
      recordingRef.current = null;
      setVoiceState('idle');
    }
  }

  async function stopVoiceRecording() {
    const recording = recordingRef.current;
    if (!recording) {
      setVoiceState('idle');
      return;
    }

    recordingRef.current = null;
    setVoiceState('transcribing');

    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    activeSearchControllerRef.current?.abort();
    const controller = new AbortController();
    activeSearchControllerRef.current = controller;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recording.getURI();
      if (!uri) {
        throw new Error('No audio was captured.');
      }

      const base64Audio = await readRecordedAudioBase64(uri);
      const originQuery = locationQuery.trim() || DEFAULT_LOCATION_QUERY;

      const data = await generateVoiceItinerary(
        {
          base64Audio,
          mimeType: 'audio/m4a',
          locationQuery: originQuery,
          originCoords: originCoordsRef.current ?? undefined,
          title: originQuery,
        },
        controller.signal
      );

      if (searchRunRef.current !== runId || controller.signal.aborted || AppState.currentState !== 'active') {
        return;
      }

      setQuery(data.transcript);
      onResults([]);
      onVoiceItineraryCreated?.({
        trip: data.trip,
        activities: data.activities,
      });
    } catch (error) {
      if (searchRunRef.current === runId && !controller.signal.aborted) {
        console.warn('Voice itinerary generation failed', error);
        onResults([]);
      }
    } finally {
      if (activeSearchControllerRef.current === controller) {
        activeSearchControllerRef.current = null;
      }
      setVoiceState('idle');
    }
  }

  function handleVoicePress() {
    if (voiceState === 'recording') {
      void stopVoiceRecording();
      return;
    }

    if (voiceState === 'transcribing') {
      return;
    }

    void startVoiceRecording();
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
        <TouchableOpacity
          style={[styles.voiceBtn, voiceState === 'recording' && styles.voiceBtnActive]}
          onPress={handleVoicePress}
        >
          <Text style={styles.voiceBtnText}>
            {voiceState === 'recording' ? '■' : voiceState === 'transcribing' ? '…' : '🎙'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => query.trim() && runSearch(query)}
          disabled={loading || voiceState !== 'idle'}
        >
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
  voiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F8',
    marginRight: 8,
  },
  voiceBtnActive: {
    backgroundColor: '#FFE7DF',
  },
  voiceBtnText: { fontSize: 15, color: Colors.ink, fontWeight: '700' },
  searchBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  locationHint: { marginTop: 8, marginLeft: 2, fontSize: 12, color: Colors.soft, fontWeight: '600' },
});
