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
  Modal,
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

function splitTime(minutes: number) {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  return {
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute,
    period: h24 >= 12 ? ('PM' as const) : ('AM' as const),
  };
}

function combineTime(hour12: number, minute: number, period: 'AM' | 'PM') {
  const normalizedHour = ((hour12 - 1) % 12) + 1;
  const h24 = period === 'PM'
    ? (normalizedHour === 12 ? 12 : normalizedHour + 12)
    : (normalizedHour === 12 ? 0 : normalizedHour);
  return h24 * 60 + minute;
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
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [timeDraft, setTimeDraft] = useState<{ hour12: number; minute: number; period: 'AM' | 'PM' }>({
    hour12: 10,
    minute: 0,
    period: 'AM',
  });

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

  function openTimePicker(id: number) {
    const current = times[id] ?? DEFAULT_START_MINUTES;
    setSelectedPlaceId(id);
    setTimeDraft(splitTime(current));
    setTimePickerOpen(true);
  }

  function closeTimePicker() {
    setTimePickerOpen(false);
    setSelectedPlaceId(null);
  }

  function saveTimePicker() {
    if (selectedPlaceId === null) return;
    const next = combineTime(timeDraft.hour12, timeDraft.minute, timeDraft.period);
    setTimes((prev) => ({ ...prev, [selectedPlaceId]: next }));
    closeTimePicker();
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
        startNewDay();
        router.replace('/feed');
        return;
      }

      Alert.alert('Trip saved', 'Your day is saved. You can keep editing it anytime.', [
        {
          text: 'Done',
          onPress: () => {
            startNewDay();
            router.replace('/feed');
          },
        },
      ]);
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
              <TouchableOpacity style={styles.timeButton} onPress={() => openTimePicker(place.id)} activeOpacity={0.85}>
                <Text style={styles.timeText}>{formatTime(times[place.id] ?? DEFAULT_START_MINUTES)}</Text>
                <Text style={styles.timeButtonSub}>Change time</Text>
              </TouchableOpacity>
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

      <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={closeTimePicker}>
        <View style={styles.timeModalBackdrop}>
          <View style={styles.timeModalSheet}>
            <View style={styles.timeModalGrab} />
            <Text style={styles.timeModalTitle}>Choose time</Text>
            <Text style={styles.timeModalSub}>
              {selectedPlaceId !== null ? places.find((place) => place.id === selectedPlaceId)?.title ?? 'This stop' : 'This stop'}
            </Text>

            <View style={styles.timeSummary}>
              <Text style={styles.timeSummaryValue}>
                {`${timeDraft.hour12}:${String(timeDraft.minute).padStart(2, '0')} ${timeDraft.period}`}
              </Text>
            </View>

            <Text style={styles.timePickerLabel}>Hour</Text>
            <View style={styles.chipGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((hour) => (
                <TouchableOpacity
                  key={hour}
                  style={[styles.timeChip, timeDraft.hour12 === hour && styles.timeChipOn]}
                  onPress={() => setTimeDraft((prev) => ({ ...prev, hour12: hour }))}
                >
                  <Text style={[styles.timeChipText, timeDraft.hour12 === hour && styles.timeChipTextOn]}>{hour}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.timePickerLabel}>Minutes</Text>
            <View style={styles.chipGrid}>
              {[0, 15, 30, 45].map((minute) => (
                <TouchableOpacity
                  key={minute}
                  style={[styles.timeChip, timeDraft.minute === minute && styles.timeChipOn]}
                  onPress={() => setTimeDraft((prev) => ({ ...prev, minute }))}
                >
                  <Text style={[styles.timeChipText, timeDraft.minute === minute && styles.timeChipTextOn]}>
                    {String(minute).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.timePickerLabel}>AM / PM</Text>
            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.periodChip, timeDraft.period === period && styles.periodChipOn]}
                  onPress={() => setTimeDraft((prev) => ({ ...prev, period }))}
                >
                  <Text style={[styles.periodText, timeDraft.period === period && styles.periodTextOn]}>{period}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.timeModalActions}>
              <TouchableOpacity style={styles.timeModalCancel} onPress={closeTimePicker}>
                <Text style={styles.timeModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timeModalSave} onPress={saveTimePicker}>
                <Text style={styles.timeModalSaveText}>Set time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  timeButton: {
    minWidth: 124,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timeButtonSub: { fontSize: 11, color: Colors.soft, marginTop: 2, fontWeight: '600' },
  timeText: { fontSize: 15, fontWeight: '800', color: Colors.ink, textAlign: 'center' },

  timeModalBackdrop: { flex: 1, backgroundColor: 'rgba(15,16,22,0.45)', justifyContent: 'flex-end' },
  timeModalSheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
  },
  timeModalGrab: { width: 42, height: 5, borderRadius: 5, backgroundColor: '#DADBD4', alignSelf: 'center', marginBottom: 14 },
  timeModalTitle: { fontWeight: '700', fontSize: 20, color: Colors.ink },
  timeModalSub: { fontSize: 12, color: Colors.soft, marginTop: 2, marginBottom: 12 },
  timeSummary: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timeSummaryValue: { fontWeight: '800', fontSize: 28, color: Colors.ink },
  timePickerLabel: { fontSize: 12, fontWeight: '700', color: Colors.soft, marginTop: 10, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.7 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    minWidth: 52,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  timeChipOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  timeChipText: { fontWeight: '700', color: Colors.ink, fontSize: 14 },
  timeChipTextOn: { color: '#fff' },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  periodChipOn: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  periodText: { fontWeight: '700', color: Colors.ink, fontSize: 14 },
  periodTextOn: { color: '#fff' },
  timeModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  timeModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timeModalCancelText: { fontWeight: '700', color: Colors.ink },
  timeModalSave: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.coral, alignItems: 'center' },
  timeModalSaveText: { color: '#fff', fontWeight: '700' },

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
