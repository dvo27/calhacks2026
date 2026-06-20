import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import RouteMap, { RoutePoint } from '@/components/map/RouteMap';

export interface FeedPost {
  id: string;
  authorName: string;
  authorInitial: string;
  authorColor: [string, string]; // gradient pair, e.g. [Colors.coral, Colors.violet]
  action: 'planned a day' | 'posted a day';
  location: string;
  timeAgo: string;
  title: string;
  driveTime: string;   // "1h 10m"
  budget: string;       // "$61"
  gas: string;           // "$7"
  miles: string;          // "28mi"
  tags: string[];
  likes: number;
  comments: number;
  saves: number;
  route: RoutePoint[];
}

interface PostCardProps {
  post: FeedPost;
  onPress?: () => void;
  onCopy?: () => void;
}

export default function PostCard({ post, onPress, onCopy }: PostCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* author row */}
      <View style={styles.authorRow}>
        <View style={[styles.avatar, { backgroundColor: post.authorColor[0] }]}>
          <Text style={styles.avatarText}>{post.authorInitial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorLine}>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <Text style={styles.muted}> {post.action}</Text>
          </Text>
          <Text style={styles.meta}>{post.location} · {post.timeAgo}</Text>
        </View>
      </View>

      {/* map */}
      <View style={styles.mapWrap}>
        <RouteMap points={post.route} height={120} borderRadius={0} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{post.title}</Text>

        {/* metadata row: drive / budget / gas / miles */}
        <View style={styles.dayMeta}>
          <View style={styles.dm}>
            <Text style={styles.dmValue}>{post.driveTime}</Text>
            <Text style={styles.dmLabel}>drive</Text>
          </View>
          <View style={styles.dm}>
            <Text style={styles.dmValue}>{post.budget}</Text>
            <Text style={styles.dmLabel}>budget</Text>
          </View>
          <View style={styles.dm}>
            <Text style={styles.dmValue}>{post.gas}</Text>
            <Text style={styles.dmLabel}>gas</Text>
          </View>
          <View style={styles.dm}>
            <Text style={styles.dmValue}>{post.miles}</Text>
            <Text style={styles.dmLabel}>miles</Text>
          </View>
        </View>

        {/* tags */}
        <View style={styles.tagRow}>
          {post.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* social row */}
        <View style={styles.socRow}>
          <Text style={styles.socItem}>❤ {post.likes}</Text>
          <Text style={styles.socItem}>💬 {post.comments}</Text>
          <Text style={styles.socItem}>🔖 {post.saves}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={(e) => {
              e.stopPropagation();
              onCopy?.();
            }}
          >
            <Text style={styles.copyBtnText}>Copy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#14162C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  authorLine: { fontSize: 14 },
  authorName: { fontWeight: '700', color: Colors.ink },
  muted: { color: Colors.soft },
  meta: { fontFamily: 'monospace', fontSize: 14, color: Colors.soft, marginTop: 1 },
  mapWrap: { width: '100%' },
  body: { padding: 14, paddingTop: 13 },
  title: {
    fontWeight: '700',
    fontSize: 19,
    letterSpacing: -0.2,
    lineHeight: 22,
    color: Colors.ink,
  },
  dayMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  dm: { flexDirection: 'column' },
  dmValue: { fontWeight: '700', fontSize: 20, color: Colors.ink },
  dmLabel: { fontSize: 10, color: Colors.soft, marginTop: 2, letterSpacing: 0.2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9, marginBottom: 9 },
  tag: {
    backgroundColor: '#F1F2EC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', color: Colors.ink2 },
  socRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  socItem: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13, color: Colors.ink2 },
  copyBtn: {
    backgroundColor: Colors.coral,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});