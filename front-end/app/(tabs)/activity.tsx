import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { getActivityFeed, type ActivityEvent } from '@/lib/api';

const AVATAR_COLORS = [
  ['#9BE15D', '#3FA34D'],
  ['#5AC8C0', '#2E7DA8'],
  ['#FF5A36', '#6B5CE0'],
  ['#6BD6CE', '#2E9BD0'],
  ['#FFA8C5', '#C56BD6'],
  ['#FFB37A', '#FF6F61'],
];

function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length][0];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function EventRow({ event }: { event: ActivityEvent }) {
  const actor = event.actor;
  const name = actor?.username ?? 'Someone';
  const initial = name[0]?.toUpperCase() ?? '?';
  const color = actor?.id ? pickColor(actor.id) : Colors.soft;

  let body: React.ReactNode;
  switch (event.type) {
    case 'follow':
      body = (
        <Text style={styles.eventText}>
          <Text style={styles.bold}>{name}</Text> started following you
        </Text>
      );
      break;
    case 'like':
      body = (
        <Text style={styles.eventText}>
          <Text style={styles.bold}>{name}</Text> liked your{' '}
          <Text style={styles.bold}>{event.trip?.title ?? 'trip'}</Text>
        </Text>
      );
      break;
    case 'comment':
      body = (
        <Text style={styles.eventText}>
          <Text style={styles.bold}>{name}</Text> commented
          {event.comment_text ? ` "${event.comment_text}"` : ''} on{' '}
          <Text style={styles.bold}>{event.trip?.title ?? 'trip'}</Text>
        </Text>
      );
      break;
    case 'share':
      body = (
        <Text style={styles.eventText}>
          <Text style={styles.bold}>{name}</Text> shared your{' '}
          <Text style={styles.bold}>{event.trip?.title ?? 'trip'}</Text>
        </Text>
      );
      break;
  }

  const showFollowBack = event.type === 'follow';

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {body}
        <Text style={styles.time}>{timeAgo(event.created_at)}</Text>
      </View>
      {showFollowBack && (
        <TouchableOpacity style={styles.followBtn} activeOpacity={0.7}>
          <Text style={styles.followBtnText}>Follow back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchActivity = useCallback(async () => {
    try {
      setError(false);
      const data = await getActivityFeed();
      setEvents(data.events);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchActivity();
    setRefreshing(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.coral} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{'\u{26A0}'}</Text>
            <Text style={styles.emptyText}>Couldn't load activity</Text>
            <TouchableOpacity onPress={fetchActivity} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{'\u{1F514}'}</Text>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>
              When people like, comment, or follow you, it'll show up here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Recent</Text>
            {events.map((event, i) => (
              <EventRow key={`${event.type}-${event.created_at}-${i}`} event={event} />
            ))}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.3,
  },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.soft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  eventText: { fontSize: 14, color: Colors.ink, lineHeight: 20 },
  bold: { fontWeight: '700' },
  time: { fontSize: 11, color: Colors.soft, marginTop: 2 },
  followBtn: {
    borderWidth: 1,
    borderColor: Colors.coral,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  followBtnText: {
    color: Colors.coral,
    fontWeight: '700',
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontWeight: '700', fontSize: 17, color: Colors.ink, marginBottom: 6 },
  emptyText: { fontSize: 14, color: Colors.soft, textAlign: 'center', maxWidth: 260 },
  retryBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.coral,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  retryText: { color: Colors.coral, fontWeight: '700', fontSize: 14 },
});
