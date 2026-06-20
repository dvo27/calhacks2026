import { TouchableOpacity, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

type Variant = 'primary' | 'ghost' | 'dark';
type Size = 'md' | 'sm';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  style?: ViewStyle;
  disabled?: boolean;
}

export default function Button({ children, onPress, variant = 'primary', size = 'md', style, disabled }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.base, styles[variant], styles[size], style, disabled && styles.disabled]}
    >
      <Text style={[styles.text, styles[`${variant}Text`], size === 'sm' && styles.smText]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row',
  },
  md: { paddingVertical: 14, paddingHorizontal: 20 },
  sm: { paddingVertical: 9, paddingHorizontal: 14 },
  primary: { backgroundColor: Colors.coral, width: '100%' },
  ghost: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line },
  dark: { backgroundColor: Colors.ink },
  disabled: { opacity: 0.4 },
  text: { fontWeight: '700', fontSize: 15 },
  smText: { fontSize: 13 },
  primaryText: { color: '#fff' },
  ghostText: { color: Colors.ink },
  darkText: { color: '#fff' },
});
