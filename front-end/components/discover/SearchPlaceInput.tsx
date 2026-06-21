import { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface SearchPlaceInputProps {
  onSelect: (place: PlaceResult) => void;
}

interface Prediction {
  place_id: string;
  description: string;
}

export default function SearchPlaceInput({ onSelect }: SearchPlaceInputProps) {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchPredictions(text), 300);
  }

  async function fetchPredictions(text: string) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text,
        )}&key=${API_KEY}`,
      );
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch (err) {
      console.warn('Places autocomplete failed', err);
    }
  }

  async function handleSelectPrediction(pred: Prediction) {
    setPredictions([]);
    setQuery(pred.description);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=name,geometry,formatted_address&key=${API_KEY}`,
      );
      const data = await res.json();
      const r = data.result;
      if (!r) return;
      onSelect({
        placeId: pred.place_id,
        name: r.name,
        address: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      });
      setQuery('');
    } catch (err) {
      console.warn('Place details failed', err);
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
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => predictions[0] && handleSelectPrediction(predictions[0])}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {predictions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.predRow} onPress={() => handleSelectPrediction(item)}>
                <Text style={styles.predText} numberOfLines={1}>{item.description}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, position: 'relative', zIndex: 10 },
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
  searchBtn: {
    backgroundColor: Colors.coral,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dropdown: {
    position: 'absolute',
    top: 58,
    left: 18,
    right: 18,
    backgroundColor: Colors.paper,
    borderRadius: 14,
    maxHeight: 220,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 6,
    overflow: 'hidden',
  },
  predRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  predText: { fontSize: 13, color: Colors.ink },
});