import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import {
  getTripTimeline,
  updateActivity,
  updateTrip,
  publishTrip,
  uploadActivityMedia,
  type TimelineActivity,
  type ActivityMedia,
} from '@/lib/api';
import TripRouteMap, { TripRoutePoint } from '@/components/map/TripRouteMap';

// No routing API/key in the project, so trip stats are estimated from straight-line
// distance between consecutive stops. Tune these if a routing provider is added.
const MPG = 25;
const GAS_PRICE_PER_GALLON = 4.5;
const AVG_SPEED_MPH = 30;
const METERS_PER_MILE = 1609.34;
const DEFAULT_START_MINUTES = 10 * 60; // 10:00 AM
const TRAVEL_BUFFER_MINUTES = 30;

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

function minutesFromISO(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function isoFromMinutes(minutes: number): string {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.toISOString();
}

function formatTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function PlanStep() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tripId = useTrekStore((s) => s.tripId);
  const stops = useTrekStore((s) => s.stops);
  const setPlanStep = useTrekStore((s) => s.setPlanStep);
  const startNewDay = useTrekStore((s) => s.startNewDay);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<TimelineActivity[]>([]);
  const [title, setTitle] = useState('');
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [times, setTimes] = useState<Record<number, number>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [media, setMedia] = useState<Record<number, ActivityMedia[]>>({});
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tripId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getTripTimeline(tripId);
        if (cancelled) return;

        setTitle(data.trip.title ?? 'My day');
        setPlaces(data.places);

        const initialRatings: Record<number, number> = {};
        const initialTimes: Record<number, number> = {};
        const initialDescriptions: Record<number, string> = {};
        const initialMedia: Record<number, ActivityMedia[]> = {};
        let cursor = DEFAULT_START_MINUTES;
        for (const place of data.places) {
          initialRatings[place.id] = place.rating ?? 0;
          initialDescriptions[place.id] = place.description ?? '';
          initialMedia[place.id] = place.media ?? [];
          const fromStart = minutesFromISO(place.startTime);
          if (fromStart !== null) {
            initialTimes[place.id] = fromStart;
            cursor = fromStart + (place.durationMinutes ?? 60) + TRAVEL_BUFFER_MINUTES;
          } else {
            initialTimes[place.id] = cursor;
            cursor += (place.durationMinutes ?? 60) + TRAVEL_BUFFER_MINUTES;
          }
        }
        setRatings(initialRatings);
        setTimes(initialTimes);
        setDescriptions(initialDescriptions);
        setMedia(initialMedia);
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
  }, [tripId, reloadKey]);

  // Drive the map + stats from the stops selected on the previous page — that's the
  // snapshot the user expects, and these always carry coordinates. Fall back to the
  // backend's stored coordinates only if the local selection is empty (e.g. reopening
  // a saved trip later).
  const mapPoints: TripRoutePoint[] = useMemo(() => {
    const selected = (stops as Array<{ id: string; name: string; lat?: number; lng?: number }>)
      .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map((s) => ({ id: s.id, name: s.name, latitude: s.lat as number, longitude: s.lng as number }));

    if (selected.length) return selected;

    return places
      .filter((p) => p.coordinates)
      .map((p) => ({
        id: p.id,
        name: p.title,
        latitude: p.coordinates!.latitude,
        longitude: p.coordinates!.longitude,
      }));
  }, [stops, places]);

  const stats = useMemo(() => {
    let meters = 0;
    for (let i = 1; i < mapPoints.length; i += 1) {
      meters += haversineMeters(mapPoints[i - 1], mapPoints[i]);
    }
    const miles = meters / METERS_PER_MILE;
    const gas = (miles / MPG) * GAS_PRICE_PER_GALLON;
    const driveMinutes = (miles / AVG_SPEED_MPH) * 60;
    const budget = places.reduce((sum, p) => sum + (p.cost || 0), 0);
    return { miles, gas, driveMinutes, budget };
  }, [mapPoints, places]);

  function setRating(id: number, value: number) {
    setRatings((prev) => ({ ...prev, [id]: prev[id] === value ? 0 : value }));
  }

  function shiftTime(id: number, deltaMinutes: number) {
    setTimes((prev) => {
      const next = Math.max(0, Math.min(1439, (prev[id] ?? DEFAULT_START_MINUTES) + deltaMinutes));
      return { ...prev, [id]: next };
    });
  }

  async function handleAddPhoto(activityId: number) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photos access needed', 'Enable photo library access to add pictures to your stops.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Couldn’t read image', 'Please try a different photo.');
        return;
      }

      setUploadingId(activityId);
      const { media: saved } = await uploadActivityMedia(activityId, {
        base64: asset.base64,
        mediaType: asset.mimeType ?? 'image/jpeg',
      });
      setMedia((prev) => ({
        ...prev,
        [activityId]: [
          ...(prev[activityId] ?? []),
          { id: saved.id, url: saved.s3_url, mediaType: saved.media_type, caption: saved.caption },
        ],
      }));
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploadingId(null);
    }
  }

  async function persist(mode: 'save' | 'share') {
    if (!tripId) return;
    setBusy(mode);
    try {
      await Promise.all(
        places.map((place) => {
          const startMinutes = times[place.id] ?? DEFAULT_START_MINUTES;
          const duration = place.durationMinutes ?? 60;
          return updateActivity(place.id, {
            rating: ratings[place.id] ? ratings[place.id] : null,
            description: descriptions[place.id]?.trim() || null,
            start_time: isoFromMinutes(startMinutes),
            end_time: isoFromMinutes(startMinutes + duration),
          });
        })
      );

      // Patch rollups after activities so the backend's auto-recompute doesn't clobber these.
      await updateTrip(tripId, {
        title: title.trim() || 'My day',
        total_distance_miles: Number(stats.miles.toFixed(1)),
        total_gas_cost: Number(stats.gas.toFixed(2)),
        total_drive_time_minutes: Math.round(stats.driveMinutes),
      });

      if (mode === 'share') {
        await publishTrip(tripId);
      }

      Alert.alert(
        mode === 'share' ? 'Shared to feed' : 'Trip saved',
        mode === 'share'
          ? 'Your day is now public on the feed.'
          : 'Your day is saved. You can keep editing it anytime.',
        [
          {
            text: 'Done',
            onPress: () => {
              startNewDay();
              router.replace('/feed');
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!tripId) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>No trip yet</Text>
        <Text style={styles.emptySub}>Add a few places first, then come back to review your day.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setPlanStep('discover')}>
          <Text style={styles.primaryBtnText}>Build a day</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.coral} />
        <Text style={styles.emptySub}>Loading your day…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Couldn’t load trip</Text>
        <Text style={styles.emptySub}>{error}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setReloadKey((k) => k + 1)}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPlanStep('discover')}>
          <Text style={styles.linkText}>Back to map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setPlanStep('discover')}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Review your day</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Name your day"
            placeholderTextColor={Colors.soft}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {mapPoints.length > 0 ? (
          <TripRouteMap points={mapPoints} style={styles.map} />
        ) : (
          <View style={[styles.map, styles.center]}>
            <Text style={styles.emptySub}>No mapped locations in this trip.</Text>
          </View>
        )}

        <View style={styles.statRow}>
          <Stat label="Distance" value={`${stats.miles.toFixed(1)} mi`} />
          <Stat label="Drive time" value={`${Math.round(stats.driveMinutes)} min`} />
          <Stat label="Gas" value={`$${stats.gas.toFixed(2)}`} />
          <Stat label="Budget" value={`$${stats.budget.toFixed(0)}`} />
        </View>

        <Text style={styles.sectionLabel}>Your route</Text>

        {places.map((place, index) => (
          <View key={place.id} style={styles.activityCard}>
            <View style={styles.activityHead}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityName} numberOfLines={1}>
                  {place.title}
                </Text>
                {place.locationName ? (
                  <Text style={styles.activityAddress} numberOfLines={1}>
                    {place.locationName}
                  </Text>
                ) : null}
              </View>
              {place.cost ? <Text style={styles.activityCost}>${place.cost}</Text> : null}
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Rating</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(place.id, star)} hitSlop={6}>
                    <Text style={[styles.star, star <= (ratings[place.id] ?? 0) && styles.starOn]}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>When</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => shiftTime(place.id, -15)} hitSlop={6}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.timeText}>{formatTime(times[place.id] ?? DEFAULT_START_MINUTES)}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => shiftTime(place.id, 15)} hitSlop={6}>
                  <Text style={styles.stepBtnText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={styles.descInput}
              value={descriptions[place.id] ?? ''}
              onChangeText={(text) => setDescriptions((prev) => ({ ...prev, [place.id]: text }))}
              placeholder="Add a note about this stop…"
              placeholderTextColor={Colors.soft}
              multiline
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {(media[place.id] ?? []).map((m) => (
                <Image key={m.id} source={{ uri: m.url }} style={styles.photo} />
              ))}
              <TouchableOpacity
                style={styles.addPhoto}
                onPress={() => handleAddPhoto(place.id)}
                disabled={uploadingId === place.id}
              >
                {uploadingId === place.id ? (
                  <ActivityIndicator color={Colors.soft} />
                ) : (
                  <Text style={styles.addPhotoText}>＋{'\n'}Photo</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        ))}

        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, busy && styles.btnDisabled]}
          disabled={busy !== null}
          onPress={() => persist('save')}
        >
          <Text style={styles.saveBtnText}>{busy === 'save' ? 'Saving…' : 'Save for later'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shareBtn, busy && styles.btnDisabled]}
          disabled={busy !== null}
          onPress={() => persist('share')}
        >
          <Text style={styles.shareBtnText}>{busy === 'share' ? 'Sharing…' : 'Share to feed'}</Text>
        </TouchableOpacity>
      </View>
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
  titleInput: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink, letterSpacing: -0.4, paddingVertical: 2 },

  scroll: { paddingHorizontal: 18, paddingBottom: 8 },
  map: { height: 220, borderRadius: 18, marginTop: 4 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: Colors.paper, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 15, color: Colors.ink },
  statLabel: { fontSize: 11, color: Colors.soft, marginTop: 3, fontWeight: '600' },

  sectionLabel: { fontWeight: '700', fontSize: 16, color: Colors.ink, marginTop: 22, marginBottom: 10 },

  activityCard: { backgroundColor: Colors.paper, borderRadius: 16, padding: 14, marginBottom: 10 },
  activityHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  numberBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  activityName: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  activityAddress: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  activityCost: { fontWeight: '700', fontSize: 14, color: Colors.ink2 },

  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  controlLabel: { fontSize: 13, color: Colors.ink2, fontWeight: '600' },
  stars: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 22, color: Colors.line },
  starOn: { color: Colors.amber },

  descInput: {
    marginTop: 12,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.ink,
    minHeight: 44,
  },
  photoRow: { marginTop: 12 },
  photo: { width: 72, height: 72, borderRadius: 12, marginRight: 8, backgroundColor: Colors.line },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { color: Colors.soft, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4 },
  stepBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, color: Colors.ink, fontWeight: '700' },
  timeText: { fontSize: 14, fontWeight: '700', color: Colors.ink, minWidth: 78, textAlign: 'center' },

  actionBar: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12,
    backgroundColor: Colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#14162C', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 6,
  },
  saveBtn: { flex: 1, backgroundColor: Colors.bg, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: Colors.ink, fontWeight: '700', fontSize: 14 },
  shareBtn: { flex: 1, backgroundColor: Colors.coral, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  emptyTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink },
  emptySub: { fontSize: 14, color: Colors.soft, textAlign: 'center' },
  primaryBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  linkText: { color: Colors.soft, fontWeight: '600', fontSize: 13 },
});
