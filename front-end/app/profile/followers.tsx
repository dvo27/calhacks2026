import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { getMyFollowers, getMyFollowing, followUser, unfollowUser, type PublicUser } from '@/lib/api';

type ListUser = PublicUser & { followed?: boolean };

export default function FollowersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: 'followers' | 'following' }>();
  const isFollowers = type !== 'following';

  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    const listFn = isFollowers ? getMyFollowers : getMyFollowing;
    Promise.all([listFn(), getMyFollowing()])
      .then(([listData, followingData]) => {
        // build set of user IDs the current user already follows
        const alreadyFollowing = new Set(
          followingData.following.map((r) => r.following?.id).filter(Boolean) as string[]
        );
        let list: ListUser[];
        if (isFollowers) {
          const rows = (listData as Awaited<ReturnType<typeof getMyFollowers>>).followers;
          list = rows.map((r) => r.follower).filter(Boolean) as ListUser[];
        } else {
          const rows = (listData as Awaited<ReturnType<typeof getMyFollowing>>).following;
          list = rows.map((r) => r.following).filter(Boolean) as ListUser[];
        }
        setUsers(list);
        const initialState: Record<string, boolean> = {};
        for (const u of list) initialState[u.id] = alreadyFollowing.has(u.id);
        setFollowState(initialState);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [isFollowers]);

  async function handleFollow(user: ListUser) {
    const isFollowed = followState[user.id] ?? false;
    setFollowState((s) => ({ ...s, [user.id]: !isFollowed }));
    try {
      if (isFollowed) await unfollowUser(user.id);
      else await followUser(user.id);
    } catch {
      setFollowState((s) => ({ ...s, [user.id]: isFollowed }));
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isFollowers ? 'Followers' : 'Following'}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.coral} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {isFollowers ? 'No followers yet.' : 'Not following anyone yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const initial = item.username?.[0]?.toUpperCase() ?? '?';
            const isFollowed = followState[item.id] ?? false;
            return (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.avatarWrap}
                  onPress={() => router.push(`/user/${item.id}`)}
                  activeOpacity={0.8}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/user/${item.id}`)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.username}>@{item.username ?? 'Anonymous'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.followBtn, isFollowed && styles.followBtnActive]}
                  onPress={() => handleFollow(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.followBtnText, isFollowed && styles.followBtnTextActive]}>
                    {isFollowed ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.ink },
  title: { fontSize: 20, fontWeight: '700', color: Colors.ink },
  list: { paddingHorizontal: 18, paddingTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.soft, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  avatarWrap: { flexShrink: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  username: { fontWeight: '700', fontSize: 15, color: Colors.ink },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.coral,
  },
  followBtnActive: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.coral },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  followBtnTextActive: { color: Colors.coral },
});
