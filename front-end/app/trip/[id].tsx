import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import {
  getTripTimeline,
  getLikes,
  likeTrip,
  unlikeTrip,
  getComments,
  addComment,
  recordShare,
  type TripTimelineResponse,
  type Comment,
} from '@/lib/api';
import TripRouteMap, { TripRoutePoint } from '@/components/map/TripRouteMap';

const MPG = 25;
const GAS_PRICE_PER_GALLON = 4.5;
const AVG_SPEED_MPH = 30;
const METERS_PER_MILE = 1609.34;

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatClock(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TripDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TripTimelineResponse | null>(null);

  // engagement
  const [likes, setLikes] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  // comment sheet
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [timeline, engagement] = await Promise.all([
          getTripTimeline(id),
          getLikes(id),
        ]);
        if (!cancelled) {
          setData(timeline);
          setLikes(engagement.engagement.likes ?? 0);
          setCommentCount(engagement.engagement.comments ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trip.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const places = data?.places ?? [];

  const mapPoints: TripRoutePoint[] = useMemo(
    () =>
      places
        .filter((p) => p.coordinates)
        .map((p) => ({ id: p.id, name: p.title, latitude: p.coordinates!.latitude, longitude: p.coordinates!.longitude })),
    [places]
  );

  const stats = useMemo(() => {
    let meters = 0;
    for (let i = 1; i < mapPoints.length; i += 1) {
      meters += haversineMeters(mapPoints[i - 1], mapPoints[i]);
    }
    const miles = meters / METERS_PER_MILE;
    return {
      miles,
      gas: (miles / MPG) * GAS_PRICE_PER_GALLON,
      driveMinutes: (miles / AVG_SPEED_MPH) * 60,
      budget: places.reduce((sum, p) => sum + (p.cost || 0), 0),
    };
  }, [mapPoints, places]);

  async function handleLike() {
    if (!id || likeBusy) return;
    setLikeBusy(true);
    try {
      if (likedByMe) {
        const res = await unlikeTrip(id);
        setLikes(res.engagement.likes ?? Math.max(0, likes - 1));
        setLikedByMe(false);
      } else {
        const res = await likeTrip(id);
        setLikes(res.engagement.likes ?? likes + 1);
        setLikedByMe(true);
      }
    } catch {
      // ignore — optimistic would over-complicate for hackathon
    } finally {
      setLikeBusy(false);
    }
  }

  async function openComments() {
    setShowComments(true);
    if (comments.length === 0) {
      setCommentsLoading(true);
      try {
        const res = await getComments(id!);
        setComments(res.comments);
      } catch {
        // silent fail
      } finally {
        setCommentsLoading(false);
      }
    }
  }

  async function handleSendComment() {
    if (!commentText.trim() || !id || sending) return;
    setSending(true);
    const text = commentText.trim();
    setCommentText('');
    try {
      const res = await addComment(id, text);
      setComments((prev) => [res.comment, ...prev]);
      setCommentCount((c) => c + 1);
    } catch {
      setCommentText(text); // restore on failure
    } finally {
      setSending(false);
    }
  }

  async function handleShare() {
    if (!data || !id) return;
    const stopList = places.map((p, i) => `${i + 1}. ${p.title}${p.locationName ? ` (${p.locationName})` : ''}`).join('\n');
    const msg = [
      `🗺️ ${data.trip.title}`,
      `by @${data.trip.user?.username ?? 'someone'}`,
      '',
      stopList,
      '',
      `📍 ${stats.miles.toFixed(1)} mi · $${stats.budget.toFixed(0)} budget · ${Math.round(stats.driveMinutes)} min drive`,
    ].join('\n');

    try {
      await Share.share({ message: msg });
      await recordShare(id).catch(() => {});
    } catch {
      // user cancelled
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.coral} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Couldn't load trip</Text>
        <Text style={styles.emptySub}>{error ?? 'Trip not found.'}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const authorName = data.trip.user?.username ?? 'Someone';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{authorName}'s day</Text>
          <Text style={styles.title} numberOfLines={1}>{data.trip.title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {mapPoints.length > 0 ? (
          <TripRouteMap points={mapPoints} style={styles.map} />
        ) : (
          <View style={[styles.map, styles.center]}>
            <Text style={styles.emptySub}>No mapped locations.</Text>
          </View>
        )}

        <View style={styles.statRow}>
          <Stat label="Distance" value={`${stats.miles.toFixed(1)} mi`} />
          <Stat label="Drive time" value={`${Math.round(stats.driveMinutes)} min`} />
          <Stat label="Gas" value={`$${stats.gas.toFixed(2)}`} />
          <Stat label="Budget" value={`$${stats.budget.toFixed(0)}`} />
        </View>

        {/* social bar */}
        <View style={styles.socialBar}>
          <TouchableOpacity
            style={[styles.socialBtn, likedByMe && styles.socialBtnActive]}
            onPress={handleLike}
            disabled={likeBusy}
            activeOpacity={0.75}
          >
            <Text style={[styles.socialIcon, likedByMe && styles.socialIconActive]}>♥</Text>
            <Text style={[styles.socialCount, likedByMe && styles.socialCountActive]}>{likes}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialBtn} onPress={openComments} activeOpacity={0.75}>
            <Text style={styles.socialIcon}>💬</Text>
            <Text style={styles.socialCount}>{commentCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialBtn} onPress={handleShare} activeOpacity={0.75}>
            <Text style={styles.socialIcon}>↗</Text>
            <Text style={styles.socialCount}>Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>The route</Text>

        {places.map((place, index) => {
          const time = formatClock(place.startTime);
          return (
            <View key={place.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberBadgeText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{place.title}</Text>
                  {place.locationName ? (
                    <Text style={styles.address} numberOfLines={1}>{place.locationName}</Text>
                  ) : null}
                </View>
                {time ? <Text style={styles.stopTime}>{time}</Text> : null}
              </View>

              {place.rating ? (
                <Text style={styles.rating}>
                  {'★'.repeat(place.rating)}
                  <Text style={styles.ratingOff}>{'★'.repeat(Math.max(0, 5 - place.rating))}</Text>
                </Text>
              ) : null}

              {place.description ? <Text style={styles.desc}>{place.description}</Text> : null}
            </View>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Comment sheet */}
      <Modal
        visible={showComments}
        animationType="slide"
        transparent
        onRequestClose={() => setShowComments(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowComments(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {commentsLoading ? (
              <ActivityIndicator color={Colors.coral} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => String(item.id)}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 4 }}
                ListEmptyComponent={
                  <View style={styles.commentsEmpty}>
                    <Text style={styles.commentsEmptyText}>No comments yet. Be first!</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>
                        {(item.user?.username ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentAuthor}>{item.user?.username ?? 'Anonymous'}</Text>
                      <Text style={styles.commentText}>{item.comment_text}</Text>
                      <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                ref={inputRef}
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor={Colors.soft}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={280}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
                onPress={handleSendComment}
                disabled={!commentText.trim() || sending}
              >
                <Text style={styles.sendBtnText}>{sending ? '…' : '↑'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.ink },
  kicker: { fontSize: 12, color: Colors.soft, fontWeight: '600' },
  title: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink, letterSpacing: -0.4 },

  scroll: { paddingHorizontal: 18, paddingBottom: 8 },
  map: { height: 220, borderRadius: 18, marginTop: 4 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: Colors.paper, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 15, color: Colors.ink },
  statLabel: { fontSize: 11, color: Colors.soft, marginTop: 3, fontWeight: '600' },

  socialBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    backgroundColor: Colors.paper,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.bg,
  },
  socialBtnActive: { backgroundColor: Colors.coralSoft },
  socialIcon: { fontSize: 18, color: Colors.ink2 },
  socialIconActive: { color: Colors.coral },
  socialCount: { fontWeight: '700', fontSize: 13, color: Colors.ink2 },
  socialCountActive: { color: Colors.coral },

  sectionLabel: { fontWeight: '700', fontSize: 16, color: Colors.ink, marginTop: 22, marginBottom: 10 },

  card: { backgroundColor: Colors.paper, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  numberBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  name: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  address: { fontSize: 12, color: Colors.soft, marginTop: 2 },
  stopTime: { fontWeight: '700', fontSize: 13, color: Colors.ink2 },
  rating: { marginTop: 10, fontSize: 16, color: Colors.amber, letterSpacing: 2 },
  ratingOff: { color: Colors.line },
  desc: { marginTop: 10, fontSize: 14, color: Colors.ink2, lineHeight: 20 },

  emptyTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: Colors.ink },
  emptySub: { fontSize: 14, color: Colors.soft, textAlign: 'center' },
  primaryBtn: { backgroundColor: Colors.coral, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // comment modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 300,
  },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.line, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  sheetTitle: { fontWeight: '700', fontSize: 17, color: Colors.ink },
  sheetClose: { fontSize: 16, color: Colors.soft, padding: 4 },

  commentsEmpty: { alignItems: 'center', paddingVertical: 32 },
  commentsEmptyText: { color: Colors.soft, fontSize: 14 },

  commentRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentAvatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  commentAuthor: { fontWeight: '700', fontSize: 13, color: Colors.ink },
  commentText: { fontSize: 14, color: Colors.ink2, lineHeight: 20, marginTop: 2 },
  commentTime: { fontSize: 11, color: Colors.soft, marginTop: 4 },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.ink,
    maxHeight: 90,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.coralSoft },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
