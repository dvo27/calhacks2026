import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useTrekStore } from '@/lib/store';
import { addTripComment, getFeed, likeTrip, type TripSummary } from '@/lib/api';
import TripCard from '@/components/feed/TripCard';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const startNewDay = useTrekStore((s) => s.startNewDay);

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentTrip, setCommentTrip] = useState<TripSummary | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getFeed();
      setTrips(data.trips);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch each time the tab gains focus so newly shared trips appear.
  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load])
  );

  function handleNewDay() {
    startNewDay();
    router.push('/plan');
  }

  function updateTripEngagement(tripId: number, next: { likes?: number; comments?: number; shares?: number }) {
    setTrips((prev) =>
      prev.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              engagement: {
                ...trip.engagement,
                ...(next.likes !== undefined ? { likes: next.likes } : {}),
                ...(next.comments !== undefined ? { comments: next.comments } : {}),
              },
            }
          : trip
      )
    );
  }

  async function handleLike(trip: TripSummary) {
    try {
      const response = await likeTrip(trip.id);
      const likes = response.engagement?.likes;
      const comments = response.engagement?.comments;
      updateTripEngagement(trip.id, {
        likes: likes ?? ((trip.engagement?.likes ?? 0) + 1),
        comments: comments ?? (trip.engagement?.comments ?? 0),
      });
    } catch (err) {
      console.warn('Failed to like trip', err);
    }
  }

  function openComment(trip: TripSummary) {
    setCommentTrip(trip);
    setCommentText('');
  }

  async function submitComment() {
    if (!commentTrip || !commentText.trim()) return;
    setCommentBusy(true);
    try {
      const response = await addTripComment(commentTrip.id, commentText.trim());
      updateTripEngagement(commentTrip.id, {
        likes: response.engagement?.likes ?? commentTrip.engagement?.likes ?? 0,
        comments: response.engagement?.comments ?? ((commentTrip.engagement?.comments ?? 0) + 1),
      });
      setCommentTrip(null);
      setCommentText('');
    } catch (err) {
      console.warn('Failed to add comment', err);
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>trek</Text>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>P</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={Colors.coral} />}
      >
        <TouchableOpacity style={styles.ctaCard} onPress={handleNewDay} activeOpacity={0.85}>
          <Text style={styles.ctaEmoji}>＋</Text>
          <View>
            <Text style={styles.ctaTitle}>Plan a new day</Text>
            <Text style={styles.ctaSub}>Build your perfect LA itinerary</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Shared days</Text>

        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : trips.length === 0 ? (
          <Text style={styles.empty}>No shared trips yet. Build a day and share it to the feed!</Text>
        ) : (
          trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              showAuthor
              onPress={() => router.push(`/trip/${trip.id}`)}
              onLike={() => void handleLike(trip)}
              onComment={() => openComment(trip)}
            />
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={commentTrip !== null} transparent animationType="fade" onRequestClose={() => setCommentTrip(null)}>
        <View style={styles.commentBackdrop}>
          <View style={styles.commentSheet}>
            <View style={styles.commentGrab} />
            <Text style={styles.commentTitle}>Add a comment</Text>
            <Text style={styles.commentTripTitle}>{commentTrip?.title ?? ''}</Text>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Write something nice…"
              placeholderTextColor={Colors.soft}
              multiline
              autoFocus
            />
            <View style={styles.commentActions}>
              <TouchableOpacity style={styles.commentCancel} onPress={() => setCommentTrip(null)}>
                <Text style={styles.commentCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.commentSubmit, commentBusy && styles.commentSubmitDisabled]}
                onPress={submitComment}
                disabled={commentBusy || !commentText.trim()}
              >
                <Text style={styles.commentSubmitText}>{commentBusy ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  logo: { fontSize: 26, fontWeight: '700', color: Colors.coral, letterSpacing: -0.5 },
  avatarBtn: {},
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.coral,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: Colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaEmoji: { fontSize: 28, color: '#fff', fontWeight: '300' },
  ctaTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ctaSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.soft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  empty: { color: Colors.soft, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
  commentBackdrop: { flex: 1, backgroundColor: 'rgba(15,16,22,0.45)', justifyContent: 'flex-end' },
  commentSheet: { backgroundColor: Colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  commentGrab: { width: 42, height: 5, borderRadius: 5, backgroundColor: '#DADBD4', alignSelf: 'center', marginBottom: 14 },
  commentTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  commentTripTitle: { marginTop: 4, fontSize: 12, color: Colors.soft, fontWeight: '600' },
  commentInput: {
    minHeight: 96,
    marginTop: 14,
    backgroundColor: Colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
  commentActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  commentCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.bg, alignItems: 'center', borderWidth: 1, borderColor: Colors.line },
  commentCancelText: { color: Colors.ink, fontWeight: '700' },
  commentSubmit: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.coral, alignItems: 'center' },
  commentSubmitDisabled: { opacity: 0.6 },
  commentSubmitText: { color: '#fff', fontWeight: '700' },
});
