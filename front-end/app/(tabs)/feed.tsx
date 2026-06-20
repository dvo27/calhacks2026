import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { FEED_POSTS } from '@/lib/mockData';
import { useTrekStore } from '@/lib/store';
import PostCard from '@/components/feed/PostCard';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const startNewDay = useTrekStore((s) => s.startNewDay);

  function handleNewDay() {
    startNewDay();
    router.push('/plan');
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>trek</Text>
        <TouchableOpacity style={styles.avatarBtn}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>P</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.ctaCard} onPress={handleNewDay} activeOpacity={0.85}>
          <Text style={styles.ctaEmoji}>＋</Text>
          <View>
            <Text style={styles.ctaTitle}>Plan a new day</Text>
            <Text style={styles.ctaSub}>Build your perfect LA itinerary</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Friends' days</Text>

        {FEED_POSTS.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onPress={() => router.push(`/post/${post.id}`)}
            onCopy={() => {
              // TODO: load this post's route into the store as a new draft trip
            }}
          />
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
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
});