import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions, Linking } from 'react-native';
import { Colors } from '@/constants/colors';
import type { TripSummary } from '@/lib/api';
import TripRouteMap, { TripRoutePoint } from '@/components/map/TripRouteMap';

interface TripCardProps {
  trip: TripSummary;
  onPress?: () => void;
  showAuthor?: boolean;
  showPrivacy?: boolean;
}

function toNum(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDrive(minutes: number | null): string {
  const m = minutes ?? 0;
  if (m <= 0) return '—';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function parseCoordinates(value: unknown): { latitude: number; longitude: number } | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) {
      const longitude = Number(match[1]);
      const latitude = Number(match[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const maybeCoords = value as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown; coordinates?: unknown };

    if (typeof maybeCoords.latitude === 'number' && typeof maybeCoords.longitude === 'number') {
      return { latitude: maybeCoords.latitude, longitude: maybeCoords.longitude };
    }

    if (typeof maybeCoords.lat === 'number' && typeof maybeCoords.lng === 'number') {
      return { latitude: maybeCoords.lat, longitude: maybeCoords.lng };
    }

    if (Array.isArray(maybeCoords.coordinates) && maybeCoords.coordinates.length >= 2) {
      const [longitude, latitude] = maybeCoords.coordinates;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

function buildGoogleMapsUrl(points: TripRoutePoint[]): string | null {
  if (points.length < 2) return null;

  const origin = `${points[0].latitude},${points[0].longitude}`;
  const destination = `${points[points.length - 1].latitude},${points[points.length - 1].longitude}`;
  const waypoints = points
    .slice(1, -1)
    .map((point) => `${point.latitude},${point.longitude}`)
    .join('|');

  const query = [
    `api=1`,
    `travelmode=driving`,
    `origin=${encodeURIComponent(origin)}`,
    `destination=${encodeURIComponent(destination)}`,
    `dir_action=navigate`,
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : null,
  ]
    .filter(Boolean)
    .join('&');

  return `https://www.google.com/maps/dir/?${query}`;
}

export default function TripCard({ trip, onPress, showAuthor, showPrivacy }: TripCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const routePoints: TripRoutePoint[] = (trip.route_preview_points ?? []).map((point) => ({
    id: point.id,
    name: point.title,
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const fallbackPoints: TripRoutePoint[] = routePoints.length
    ? routePoints
    : (trip.activities ?? []).reduce<TripRoutePoint[]>((points, activity, index) => {
        const coordinates = parseCoordinates(activity.location_coords);
        if (!coordinates) return points;

        points.push({
          id: activity.id ?? index,
          name: activity.title ?? `Stop ${index + 1}`,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        });

        return points;
      }, []);
  const stops = trip.activities?.length ?? 0;
  const cover = trip.trip_media?.[0]?.s3_url ?? null;
  const photos = (trip.trip_media ?? []).filter((media) => media.media_type !== 'video');
  const photoCount = trip.trip_media?.length ?? 0;
  const description = trip.activities?.find((activity) => activity.description?.trim())?.description?.trim() ?? null;
  const author = trip.user?.username ?? 'Someone';
  const initial = author.charAt(0).toUpperCase() || '?';
  const cardWidth = Math.max(0, screenWidth - 36);
  const directionsUrl = buildGoogleMapsUrl(fallbackPoints);
  const mediaSlides = [
    ...(fallbackPoints.length > 0 ? [{ key: 'route', type: 'route' as const }] : []),
    ...(cover ? [{ key: `cover-${cover}`, type: 'cover' as const, url: cover }] : []),
    ...photos
      .filter((photo) => photo.s3_url !== cover)
      .map((photo) => ({ key: `photo-${photo.id ?? photo.s3_url}`, type: 'photo' as const, url: photo.s3_url })),
  ];

  return (
    <View style={styles.card}>
      {showAuthor ? (
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.authorName}>{author}</Text>
        </View>
      ) : null}

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        style={styles.mediaStrip}
        contentContainerStyle={styles.mediaStripContent}
      >
        {mediaSlides.map((slide) => (
          <View key={slide.key} style={[styles.cover, { width: cardWidth }]}>
            {slide.type === 'route' ? (
              <TripRouteMap points={fallbackPoints} style={styles.cover} />
            ) : slide.type === 'cover' ? (
              <Image source={{ uri: slide.url }} style={styles.cover} />
            ) : (
              <Image source={{ uri: slide.url }} style={styles.cover} />
            )}
          </View>
        ))}
        {mediaSlides.length === 0 ? (
          <View style={[styles.cover, styles.coverEmpty, { width: cardWidth }]}>
            <Text style={styles.coverEmptyText}>🗺️</Text>
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity style={styles.body} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{trip.title}</Text>
          {showPrivacy ? (
            <View style={[styles.badge, trip.is_public ? styles.badgePublic : styles.badgeDraft]}>
              <Text style={[styles.badgeText, trip.is_public ? styles.badgeTextPublic : styles.badgeTextDraft]}>
                {trip.is_public ? 'Shared' : 'Draft'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaGroup}>
            <Meta value={`${stops}`} label="stops" />
            <Meta value={`${photoCount}`} label="photos" />
            <Meta value={formatDrive(trip.total_drive_time_minutes)} label="drive" />
            <Meta value={`$${toNum(trip.total_budget).toFixed(0)}`} label="budget" />
            <Meta value={`${toNum(trip.total_distance_miles).toFixed(0)} mi`} label="miles" />
          </View>
          {directionsUrl ? (
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={async () => {
                const canOpen = await Linking.canOpenURL(directionsUrl);
                if (canOpen) {
                  await Linking.openURL(directionsUrl);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.copyBtnText}>Open in Maps</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function Meta({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  authorName: { fontWeight: '700', color: Colors.ink, fontSize: 14 },

  cover: { width: '100%', height: 160, backgroundColor: Colors.line },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  coverEmptyText: { fontSize: 40 },
  mediaStrip: { width: '100%' },
  mediaStripContent: { flexDirection: 'row' },

  body: { padding: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontWeight: '700', fontSize: 20, letterSpacing: -0.2, color: Colors.ink },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgePublic: { backgroundColor: '#E3F4EC' },
  badgeDraft: { backgroundColor: Colors.bg },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextPublic: { color: Colors.mint },
  badgeTextDraft: { color: Colors.soft },

  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line },
  metaGroup: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  meta: { flexDirection: 'column' },
  metaValue: { fontWeight: '700', fontSize: 18, color: Colors.ink },
  metaLabel: { fontSize: 10, color: Colors.soft, marginTop: 2 },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.ink,
    alignSelf: 'flex-start',
  },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  description: { marginTop: 12, fontSize: 13, lineHeight: 19, color: Colors.ink2 },
});
