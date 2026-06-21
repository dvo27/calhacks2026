import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

const CATEGORIES = ['all', 'food', 'shopping', 'nightlife', 'attractions'];
const PRICES = ['all', '$', '$$', '$$$', 'Free'];

interface TagRowProps {
  categoryFilter: string;
  priceFilter: string;
  onCategoryChange: (c: string) => void;
  onPriceChange: (p: string) => void;
}

export default function TagRow({
  categoryFilter,
  priceFilter,
  onCategoryChange,
  onPriceChange,
}: TagRowProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={categoryFilter === c} onPress={() => onCategoryChange(c)} />
        ))}
      </View>
      <View style={styles.row}>
        {PRICES.map((p) => (
          <Chip key={p} label={p} active={priceFilter === p} onPress={() => onPriceChange(p)} accent />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && (accent ? styles.chipAccentOn : styles.chipOn)]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, gap: 7, marginTop: 9 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  chipOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipAccentOn: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.ink2 },
  chipTextOn: { color: '#fff' },
});