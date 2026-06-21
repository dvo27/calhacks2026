import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import RouteMap from '@/components/map/RouteMap';
import { getMyProfile, updateProfile } from '@/lib/api';
import { useTrekStore } from '@/lib/store';

async function fetchMe(): Promise<ProfileData | null> {
  try {
    return await getMyProfile() as ProfileData;
  } catch {
    return null;
  }
}

const WANT_TO_GO = [
  { name: 'Sushi Park', meta: 'Sushi · West Hollywood · $$$', emoji: '🍣', cat: 'food' },
  { name: 'République', meta: 'Bakery · Mid-City · $$', emoji: '🥐', cat: 'food' },
  { name: 'Death & Co', meta: 'Cocktails · Arts District · $$$', emoji: '🎸', cat: 'nightlife' },
  { name: 'Mohawk General Store', meta: 'Boutique · Silver Lake · $$', emoji: '🛍', cat: 'shopping' },
];

const CAT_BG: Record<string, string> = {
  food: '#FFE8DC', shopping: '#F8E0FF', nightlife: '#E4E0FF', attractions: '#D8F4F0',
};

type Tab = 'days' | 'wtg' | 'saved';

interface Trip {
  id: number;
  title: string;
  is_public: boolean;
  total_budget: number | null;
  total_distance_miles: number | null;
  total_drive_time_minutes: number | null;
}

interface ProfileData {
  profile: { id: string; username: string | null; avatar_url: string | null };
  stats: { trips: number; followers: number; following: number; collections: number };
  trips: Trip[];
  drafts: Trip[];
  collections: { id: number; name: string }[];
}

function fmtMin(m: number | null) {
  if (!m) return null;
  const h = Math.floor(m / 60);
  const x = m % 60;
  return h ? `${h}h${x ? ` ${x}m` : ''}` : `${x}m`;
}

function initials(username: string | null, email: string) {
  if (username) return username[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setTripId, setPlanStep } = useTrekStore();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('days');
  const [userEmail, setUserEmail] = useState('');

  // edit profile modal
  const [showEdit, setShowEdit] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setUserEmail(s.session?.user?.email ?? '');
    });
    fetchMe().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  function openEdit() {
    setEditUsername(data?.profile.username ?? '');
    setShowEdit(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function saveUsername() {
    const trimmed = editUsername.trim();
    if (!trimmed || trimmed === data?.profile.username) {
      setShowEdit(false);
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfile({ username: trimmed });
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, username: res.profile.username } } : prev);
      setShowEdit(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update username.');
    } finally {
      setSaving(false);
    }
  }

  async function handleShareProfile() {
    const username = data?.profile.username ?? userEmail.split('@')[0] ?? 'me';
    const tripCount = data?.stats.trips ?? 0;
    const msg = `Add me on Trek!\n📍 @${username} · ${tripCount} trip${tripCount !== 1 ? 's' : ''} posted`;
    try {
      await Share.share({ message: msg });
    } catch {
      // user cancelled
    }
  }

  function openTrip(trip: Trip) {
    if (trip.is_public) {
      router.push(`/trip/${trip.id}`);
    } else {
      // draft — load into plan step for editing
      setTripId(trip.id);
      setPlanStep('plan');
      router.push('/plan');
    }
  }

  const displayName = data?.profile.username ?? userEmail.split('@')[0] ?? 'You';
  const handle = data?.profile.username ? `@${data.profile.username}` : userEmail;
  const allDays = [...(data?.trips ?? []), ...(data?.drafts ?? [])];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* header */}
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Profile</Text>
      </View>

      {loading ? (
        <View style={styles.loadWrap}>
          <ActivityIndicator color={Colors.coral} size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* identity */}
          <View style={styles.identRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(data?.profile.username ?? null, userEmail)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.displayName}>{displayName}</Text>
              <Text style={styles.handle}>{handle}</Text>
            </View>
          </View>

          {/* stats */}
          <View style={styles.statsRow}>
            {[
              { label: 'days', value: data?.stats.trips ?? 0, route: null },
              { label: 'collections', value: data?.stats.collections ?? 0, route: null },
              { label: 'followers', value: data?.stats.followers ?? 0, route: '/profile/followers?type=followers' },
              { label: 'following', value: data?.stats.following ?? 0, route: '/profile/followers?type=following' },
            ].map((s) => (
              <TouchableOpacity
                key={s.label}
                style={styles.statCell}
                disabled={!s.route}
                activeOpacity={s.route ? 0.7 : 1}
                onPress={s.route ? () => router.push(s.route as any) : undefined}
              >
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={[styles.statLabel, s.route && styles.statLabelTappable]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={openEdit}>
              <Text style={styles.actionBtnText}>Edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={handleShareProfile}>
              <Text style={styles.actionBtnText}>Share profile</Text>
            </TouchableOpacity>
          </View>

          {/* tabs */}
          <View style={styles.tabs}>
            {([['days', 'Trips'], ['wtg', 'Places'], ['saved', 'Drafts']] as [Tab, string][]).map(([key, label]) => (
              <TouchableOpacity key={key} style={styles.tab} onPress={() => setTab(key)}>
                <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
                {tab === key && <View style={styles.tabBar} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* days tab */}
          {tab === 'days' && (
            allDays.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🗺️</Text>
                <Text style={styles.emptyText}>No days yet. Plan one!</Text>
              </View>
            ) : (
              allDays.map((trip) => (
                <TouchableOpacity key={trip.id} style={styles.tripRow} activeOpacity={0.8} onPress={() => openTrip(trip)}>
                  <View style={styles.tripThumb}>
                    <RouteMap points={[]} height={78} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tripName} numberOfLines={1}>{trip.title}</Text>
                    <Text style={styles.tripMeta} numberOfLines={1}>
                      {[
                        trip.total_budget != null && `$${trip.total_budget}`,
                        fmtMin(trip.total_drive_time_minutes ?? null),
                        trip.total_distance_miles != null && `${Math.round(trip.total_distance_miles)}mi`,
                        trip.is_public ? '🌐 public' : '🔒 draft',
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))
            )
          )}

          {/* want to go tab */}
          {tab === 'wtg' && (
            <View>
              <Text style={styles.sectionNote}>Places you want to visit…</Text>
              {WANT_TO_GO.map((p) => (
                <View key={p.name} style={styles.wtgRow}>
                  <View style={[styles.wtgIcon, { backgroundColor: CAT_BG[p.cat] ?? '#F1F2EC' }]}>
                    <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.wtgName}>{p.name}</Text>
                    <Text style={styles.wtgMeta}>{p.meta}</Text>
                  </View>
                  <Text style={styles.wtgBookmark}>🔖</Text>
                </View>
              ))}
            </View>
          )}

          {/* collections/drafts tab */}
          {tab === 'saved' && (
            data?.collections.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>📂</Text>
                <Text style={styles.emptyText}>No collections yet.</Text>
              </View>
            ) : (
              (data?.collections ?? []).map((c) => (
                <View key={c.id} style={styles.collRow}>
                  <View style={styles.collIcon}>
                    <Text style={{ fontSize: 22 }}>📁</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.collName}>{c.name}</Text>
                  </View>
                  <Text style={{ color: Colors.soft }}>›</Text>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}

      {/* Edit profile modal */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowEdit(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit profile</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBody}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                ref={inputRef}
                style={styles.fieldInput}
                value={editUsername}
                onChangeText={setEditUsername}
                placeholder="your_username"
                placeholderTextColor={Colors.soft}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={saveUsername}
              />
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saveUsername}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10,
  },
  pageTitle: { fontWeight: '700', fontSize: 28, color: Colors.ink, letterSpacing: -0.5 },

  scroll: { paddingHorizontal: 18, paddingBottom: 32 },

  identRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 26 },
  displayName: { fontWeight: '700', fontSize: 20, color: Colors.ink, letterSpacing: -0.3 },
  handle: { fontSize: 13, color: Colors.soft, marginTop: 2 },

  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.paper,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.line,
    overflow: 'hidden', marginBottom: 12,
  },
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRightWidth: 1, borderRightColor: Colors.line,
  },
  statValue: { fontWeight: '700', fontSize: 18, color: Colors.ink },
  statLabel: { fontSize: 11, color: Colors.soft, marginTop: 2 },
  statLabelTappable: { color: Colors.coral },

  actionRow: { flexDirection: 'row', gap: 9, marginBottom: 4 },
  actionBtn: {
    paddingVertical: 11, borderRadius: 13, alignItems: 'center',
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line,
  },
  actionBtnText: { fontWeight: '700', fontSize: 14, color: Colors.ink },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.line,
    marginTop: 14, marginBottom: 12, gap: 18,
  },
  tab: { paddingBottom: 9, alignItems: 'center' },
  tabText: { fontWeight: '700', fontSize: 14, color: Colors.soft },
  tabTextOn: { color: Colors.ink },
  tabBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: Colors.coral, borderRadius: 2,
  },

  tripRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  tripThumb: { width: 78, height: 78, borderRadius: 12, overflow: 'hidden', flexShrink: 0 },
  tripName: { fontWeight: '700', fontSize: 16, color: Colors.ink },
  tripMeta: { fontSize: 12, color: Colors.soft, marginTop: 4 },
  chevron: { fontSize: 22, color: Colors.soft },

  wtgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  wtgIcon: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  wtgName: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  wtgMeta: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  wtgBookmark: { fontSize: 18, flexShrink: 0 },

  collRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.paper, borderRadius: 14, borderWidth: 1, borderColor: Colors.line,
    padding: 13, marginBottom: 10,
  },
  collIcon: {
    width: 46, height: 46, borderRadius: 12, flexShrink: 0,
    backgroundColor: '#FFE8DC', alignItems: 'center', justifyContent: 'center',
  },
  collName: { fontWeight: '700', fontSize: 16, color: Colors.ink },

  sectionNote: { fontSize: 13, color: Colors.soft, marginBottom: 4 },
  emptyWrap: { alignItems: 'center', paddingTop: 36 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: Colors.soft, marginTop: 8, fontSize: 13 },

  // edit modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.line, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  sheetTitle: { fontWeight: '700', fontSize: 18, color: Colors.ink },
  sheetClose: { fontSize: 16, color: Colors.soft, padding: 4 },
  sheetBody: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.soft, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  fieldInput: {
    backgroundColor: Colors.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.ink,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  saveBtn: {
    backgroundColor: Colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
