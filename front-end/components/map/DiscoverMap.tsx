import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, LongPressEvent } from 'react-native-maps';
import { Colors } from '@/constants/colors';

type SnapshotMarkerProps = ComponentProps<typeof Marker> & { redrawKey?: string | number };

/**
 * A Marker that self-manages `tracksViewChanges`. On Apple Maps (iOS), a custom
 * marker view is snapshotted to a static image; if tracking is off when it mounts,
 * the snapshot is captured before the view lays out and the pin renders BLANK until
 * the map redraws (e.g. you tap another marker). A blank pin also makes taps fall
 * through to a neighbor, so the wrong callout/title shows.
 *
 * Each marker independently tracks for a beat after it mounts (and whenever its
 * rendered content changes), captures a correct snapshot, then stops — which keeps
 * callouts stable and avoids the perpetual re-render cost of leaving tracking on.
 */
function SnapshotMarker({ redrawKey, children, ...markerProps }: SnapshotMarkerProps) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), 1000);
    return () => clearTimeout(timer);
  }, [redrawKey]);

  return (
    <Marker {...markerProps} tracksViewChanges={tracks}>
      {children}
    </Marker>
  );
}

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface MapCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface DiscoverMapProps {
  stops: MapStop[];
  candidates?: MapCandidate[];
  initialRegion: { latitude: number; longitude: number };
  currentLocation?: { latitude: number; longitude: number } | null;
  focusPoint?: { latitude: number; longitude: number } | null;
  fitStopsToken?: number;
  onLongPress: (coord: { latitude: number; longitude: number }) => void;
  onCandidatePress?: (candidate: MapCandidate) => void;
  onStopPress?: (stop: MapStop) => void;
}

export default function DiscoverMap({
  stops,
  candidates = [],
  initialRegion,
  currentLocation,
  focusPoint,
  fitStopsToken,
  onLongPress,
  onCandidatePress,
  onStopPress,
}: DiscoverMapProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const prevCandidateCountRef = useRef(0);
  const addedIds = new Set(stops.map((s) => s.id));

  function handleLongPress(e: LongPressEvent) {
    onLongPress(e.nativeEvent.coordinate);
  }

  // Animate to user's GPS location once map is ready and coords arrive.
  const initialRegionRef = useRef(initialRegion);
  useEffect(() => {
    if (!mapReady) return;
    const prev = initialRegionRef.current;
    if (prev.latitude === initialRegion.latitude && prev.longitude === initialRegion.longitude) return;
    initialRegionRef.current = initialRegion;
    mapRef.current?.animateToRegion(
      { latitude: initialRegion.latitude, longitude: initialRegion.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 },
      400
    );
  }, [initialRegion, mapReady]);

  // Jump to the searched area when a new search origin resolves.
  useEffect(() => {
    if (!mapReady || !focusPoint) return;

    mapRef.current?.animateToRegion(
      {
        latitude: focusPoint.latitude,
        longitude: focusPoint.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      },
      300
    );
  }, [focusPoint, mapReady]);

  useEffect(() => {
    if (!mapReady || !fitStopsToken || !stops.length) return;

    const markerCoordinates = [
      ...(currentLocation ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : []),
      ...stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
    ];

    if (markerCoordinates.length === 1) {
      mapRef.current?.animateToRegion(
        {
          latitude: markerCoordinates[0].latitude,
          longitude: markerCoordinates[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        300
      );
      return;
    }

    mapRef.current?.fitToCoordinates(markerCoordinates, {
      edgePadding: { top: 110, right: 70, bottom: 260, left: 70 },
      animated: true,
    });
  }, [currentLocation, fitStopsToken, mapReady, stops]);

  // Frame the map around incoming search results. Gated on the candidate set
  // GROWING so that adding/removing itinerary stops never moves the camera —
  // otherwise every tap to add an activity would refit and zoom the map out.
  useEffect(() => {
    if (!mapReady) return;

    const grew = candidates.length > prevCandidateCountRef.current;
    prevCandidateCountRef.current = candidates.length;
    if (!grew) return;

    const markerCoordinates = [
      ...(currentLocation ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : []),
      ...stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
      ...candidates.map((candidate) => ({ latitude: candidate.lat, longitude: candidate.lng })),
    ];

    if (markerCoordinates.length === 1) {
      mapRef.current?.animateToRegion(
        {
          latitude: markerCoordinates[0].latitude,
          longitude: markerCoordinates[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        300
      );
      return;
    }

    if (markerCoordinates.length > 1) {
      mapRef.current?.fitToCoordinates(markerCoordinates, {
        edgePadding: { top: 110, right: 70, bottom: 260, left: 70 },
        animated: true,
      });
    }
  }, [candidates, currentLocation, mapReady, stops]);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        onMapReady={() => setMapReady(true)}
        initialRegion={{
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onLongPress={handleLongPress}
      >
        {stops.length > 1 && (
          <Polyline
            coordinates={stops.map((s) => ({ latitude: s.lat, longitude: s.lng }))}
            strokeColor={Colors.ink}
            strokeWidth={3}
          />
        )}

        {/* unconfirmed search results — tap to add to itinerary. A candidate
            already added as a stop is hidden here; its numbered pin stands in. */}
        {candidates
          .filter((c) => !addedIds.has(c.id))
          .map((c) => (
            <SnapshotMarker
              key={`cand-${c.id}`}
              redrawKey={`cand-${c.id}`}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              title={c.name}
              onPress={() => onCandidatePress?.(c)}
            >
              <View style={styles.candidatePin}>
                <Text style={styles.candidatePinText}>＋</Text>
              </View>
            </SnapshotMarker>
          ))}

        {/* confirmed itinerary stops — numbered, named, in order. Tap to deselect (remove). */}
        {stops.map((s, i) => (
          <SnapshotMarker
            key={s.id}
            redrawKey={`${s.id}:${i + 1}:${s.name}`}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name}
            zIndex={1}
            onPress={() => onStopPress?.(s)}
          >
            <View style={styles.stopMarker}>
              <View style={styles.pin}>
                <Text style={styles.pinText}>{i + 1}</Text>
              </View>
              <View style={styles.stopLabel}>
                <Text style={styles.stopLabelText} numberOfLines={1}>
                  {s.name}
                </Text>
              </View>
            </View>
          </SnapshotMarker>
        ))}

        {currentLocation && (
          <SnapshotMarker
            key="current-location"
            redrawKey="current-location"
            coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
            title="You are here"
          >
            <View style={styles.currentLocationPin}>
              <View style={styles.currentLocationCore} />
            </View>
          </SnapshotMarker>
        )}
      </MapView>

      <View style={styles.hint}>
        <Text style={styles.hintIcon}>📍</Text>
        <Text style={styles.hintText}>Long-press to drop a pin</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, marginHorizontal: 0 },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  pinText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  stopMarker: { alignItems: 'center' },
  stopLabel: {
    marginTop: 4,
    maxWidth: 140,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  stopLabelText: { color: Colors.ink, fontWeight: '700', fontSize: 11 },
  currentLocationPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EAF3FF',
    borderWidth: 2,
    borderColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F6BFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  currentLocationCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2F6BFF',
  },
  candidatePin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  candidatePinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: {
    position: 'absolute',
    bottom: 14,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  hintIcon: { fontSize: 13 },
  hintText: { fontSize: 12, fontWeight: '700', color: Colors.ink2 },
});
