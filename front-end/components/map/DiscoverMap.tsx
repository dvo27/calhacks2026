import { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, LongPressEvent } from 'react-native-maps';
import { Colors } from '@/constants/colors';

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface DiscoverMapProps {
  stops: MapStop[];
  initialRegion: { latitude: number; longitude: number };
  onLongPress: (coord: { latitude: number; longitude: number }) => void;
}

export default function DiscoverMap({ stops, initialRegion, onLongPress }: DiscoverMapProps) {
  const mapRef = useRef<MapView>(null);

  function handleLongPress(e: LongPressEvent) {
    onLongPress(e.nativeEvent.coordinate);
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
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

        {stops.map((s, i) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name}
          >
            <View style={styles.pin}>
              <Text style={styles.pinText}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
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