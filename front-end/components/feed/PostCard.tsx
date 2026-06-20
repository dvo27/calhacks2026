import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Post } from '@/lib/types';
import { MINI_ROUTES } from '@/lib/mockData';
import RouteMap from '@/components/map/RouteMap';
import { Colors } from '@/constants/colors';

interface Props {
  post: Post;
}

export default function PostCard({ post }: Props) {
  const router = useRouter();
  const pts = MINI_ROUTES[post.mapKey] ?? [];

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/post/${post.id}`)}>
      <View style={styles.author}>
        <View style={[styles.avatar, { backgroundColor: Colors.coral }]}>
          <Text style={styles.avatarText}>{post.authorInitial}</Text>
        </View>
        <View>
          <Text style={styles.authorName}>@{post.author.toLowerCase()}</Text>
          <Text style={styles.meta}>{post.drive} · {post.budget}</Text>
        </View>
      </View>

      <RouteMap points={pts} height={96} showRoute />

      <Text style={styles.title}>{post.title}</Text>

      <View style={styles.tags}>
        {post.tags.map((t) => (
          <Text key={t} style={styles.tag}>{t}</Text>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 12,
    marginBottom: 12,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  authorName: { fontWeight: '600', fontSize: 13, color: Colors.ink },
  meta: { fontSize: 11, color: Colors.soft, marginTop: 1 },
  title: { fontWeight: '700', fontSize: 15, color: Colors.ink, marginTop: 10, marginBottom: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 11, fontWeight: '700', color: Colors.ink2,
    backgroundColor: '#F1F2EC', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3,
  },
});
