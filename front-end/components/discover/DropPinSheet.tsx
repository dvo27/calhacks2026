import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Colors } from '@/constants/colors';

const CATS = ['food', 'shopping', 'nightlife', 'attractions'];

export interface DropPinResult {
  name: string;
  cat: string;
  cost: number;
  dur: number;
}

interface DropPinSheetProps {
  visible: boolean;
  coordLabel?: string;
  onCancel: () => void;
  onConfirm: (result: DropPinResult) => void;
}

export default function DropPinSheet({ visible, coordLabel, onCancel, onConfirm }: DropPinSheetProps) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('attractions');
  const [cost, setCost] = useState('0');
  const [dur, setDur] = useState('45');

  useEffect(() => {
    if (visible) {
      setName('');
      setCat('attractions');
      setCost('0');
      setDur('45');
    }
  }, [visible]);

  function handleAdd() {
    onConfirm({
      name: name.trim() || 'Custom spot',
      cat,
      cost: Number(cost) || 0,
      dur: Number(dur) || 45,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Name this spot</Text>
          {coordLabel ? <Text style={styles.coord}>{coordLabel}</Text> : null}

          <Text style={styles.field}>Place name</Text>
          <View style={styles.inputRow}>
            <Text style={styles.pin}>📍</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Secret viewpoint"
              placeholderTextColor={Colors.soft}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          <Text style={styles.field}>Category</Text>
          <View style={styles.chipRow}>
            {CATS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, cat === c && styles.chipOn]}
                onPress={() => setCat(c)}
              >
                <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.field}>Cost $</Text>
              <TextInput
                style={styles.smallInput}
                value={cost}
                onChangeText={setCost}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.field}>Mins</Text>
              <TextInput
                style={styles.smallInput}
                value={dur}
                onChangeText={setDur}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
              <Text style={styles.confirmText}>Add pin</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,16,22,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingBottom: 22, paddingTop: 8 },
  grab: { width: 42, height: 5, borderRadius: 5, backgroundColor: '#DADBD4', alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: 'serif', fontWeight: '700', fontSize: 20, color: Colors.ink },
  coord: { fontSize: 11, color: Colors.soft, marginTop: 2, marginBottom: 6, fontFamily: 'monospace' },
  field: { fontSize: 12, fontWeight: '700', color: Colors.soft, marginTop: 14, marginBottom: 7 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: Colors.line },
  pin: { fontSize: 13 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: Colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.ink2 },
  chipTextOn: { color: '#fff' },
  row2: { flexDirection: 'row', gap: 11 },
  smallInput: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: Colors.ink },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.line },
  cancelText: { fontWeight: '700', color: Colors.ink2 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.coral },
  confirmText: { fontWeight: '700', color: '#fff' },
});