import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  icon: React.ReactNode;
  value: string;
  label: string;
  flash?: boolean;
}

export default function MetricTile({ icon, value, label, flash }: Props) {
  return (
    <View style={[styles.tile, flash && styles.flash]}>
      {icon}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1, alignItems: 'center', padding: 12,
    backgroundColor: Colors.paper, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.line,
    shadowColor: Colors.ink, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  flash: { backgroundColor: Colors.coralSoft },
  value: { fontWeight: '700', fontSize: 16, color: Colors.ink, marginTop: 4 },
  label: { fontSize: 10, color: Colors.soft, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
});
