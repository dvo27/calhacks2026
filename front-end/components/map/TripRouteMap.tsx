import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Colors } from '@/constants/colors';

export interface TripRoutePoint {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
}

interface TripRouteMapProps {
  points: TripRoutePoint[];
  style?: ViewStyle;
}

type SnapshotMarkerProps = ComponentProps<typeof Marker> & { redrawKey?: string | number };

// See DiscoverMap for the full rationale: a custom marker view on Apple Maps must
// keep tracking view changes until it lays out, or it snapshots blank. Each marker
// tracks briefly after mount, then stops.
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

export default function TripRouteMap({ points, style }: TripRouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || points.length === 0) return;

    if (points.length === 1) {
      mapRef.current?.animateToRegion(
        {
          latitude: points[0].latitude,
          longitude: points[0].longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        300
      );
      return;
    }

    mapRef.current?.fitToCoordinates(
      points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      { edgePadding: { top: 56, right: 56, bottom: 56, left: 56 }, animated: true }
    );
  }, [mapReady, points]);

  const initial = points[0];

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        onMapReady={() => setMapReady(true)}
        initialRegion={{
          latitude: initial?.latitude ?? 34.05,
          longitude: initial?.longitude ?? -118.24,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor={Colors.ink}
            strokeWidth={3}
          />
        )}

        {points.map((p, i) => (
          <SnapshotMarker
            key={p.id}
            redrawKey={`${p.id}:${i + 1}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.name}
          >
            <View style={styles.pin}>
              <Text style={styles.pinText}>{i + 1}</Text>
            </View>
          </SnapshotMarker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: Colors.line },
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
});
