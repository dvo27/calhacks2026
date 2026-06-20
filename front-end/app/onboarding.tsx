import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
          },
        });
        if (error) throw error;
        Alert.alert('Check your email', 'Confirm your account then log in.');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace('/(tabs)/feed');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        {/* logo */}
        <Text style={styles.logo}>trek</Text>
        <Text style={styles.tagline}>plan your perfect day</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'signup' ? 'Create account' : 'Welcome back'}</Text>

          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={Colors.soft}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.soft}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.soft}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{mode === 'signup' ? 'Create account' : 'Log in'}</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
          <Text style={styles.toggle}>
            {mode === 'signup' ? 'Already have an account? ' : 'No account? '}
            <Text style={styles.toggleLink}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.coral,
    letterSpacing: -1,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    color: Colors.soft,
    marginBottom: 40,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.paper,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 18,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.ink,
    backgroundColor: Colors.bg,
    marginBottom: 12,
  },
  btn: {
    height: 52,
    backgroundColor: Colors.coral,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggle: { fontSize: 14, color: Colors.soft },
  toggleLink: { color: Colors.coral, fontWeight: '700' },
});
