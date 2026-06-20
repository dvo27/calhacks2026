import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
  variant?: 'default' | 'coral';
}

export default function Chip({ label, active, onPress, variant = 'default' }: Props) {
  const isCoral = variant === 'coral';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        active && (isCoral ? styles.activeCoralChip : styles.activeChip),
      ]}
    >
      <Text style={[styles.label, active && (isCoral ? styles.activeCoralLabel : styles.activeLabel)]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.line,
    backgroundColor: Colors.paper,
  },
  activeChip: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  activeCoralChip: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  label: { fontSize: 13, fontWeight: '600', color: Colors.soft },
  activeLabel: { color: '#fff' },
  activeCoralLabel: { color: '#fff' },
});
