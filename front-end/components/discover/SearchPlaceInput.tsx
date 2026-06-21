import { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { getPlaceSuggestions, PlaceSuggestion } from '@/lib/api';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
}

interface SearchPlaceInputProps {
  areaContext: string;
  onResults: (places: PlaceSuggestion[]) => void; // fired whenever a search returns — drives map pins
}

export default function SearchPlaceInput({ areaContext, onResults }: SearchPlaceInputProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      onResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(text), 400);
  }

  async function runSearch(text: string) {
    setLoading(true);
    try {
      const locationQuery = areaContext ? `${text} ${areaContext}` : text;
      const data = await getPlaceSuggestions(locationQuery);
      onResults(data.places);
    } catch (err) {
      console.warn('Place suggestions failed', err);
      onResults([]);
    } finally {
      setLoading(false);
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
});