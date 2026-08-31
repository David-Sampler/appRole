import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { listEvents } from '../api/events';
import { ApiError } from '../api/client';
import { CATEGORIES } from '../data/categories';
import { Event } from '../types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BuyerStackParamList } from '../navigation/types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<BuyerStackParamList, 'Explore'>;

function lowestPrice(event: Event) {
  return Math.min(...event.ticketTypes.map((tt) => tt.price));
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function ExploreScreen({ navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [events, setEvents] = useState<Event[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setError(null);
    try {
      const { events: fetched } = await listEvents({
        search: query || undefined,
        category: category || undefined,
      });
      setEvents(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os eventos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [query, category]);

  useFocusEffect(
    useCallback(() => {
      fetchEvents({ silent: true });
    }, [fetchEvents])
  );

  useEffect(() => {
    const timeout = setTimeout(() => fetchEvents(), 300);
    return () => clearTimeout(timeout);
  }, [query, category]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEvents({ silent: true });
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar evento ou cidade"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={(item) => item}
        style={styles.categoryList}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.categoryChip,
              category === item && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setCategory(category === item ? null : item)}
          >
            <Text style={[styles.categoryChipText, category === item && styles.categoryChipTextSelected]}>
              {item}
            </Text>
          </Pressable>
        )}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>Nenhum evento encontrado</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
            >
              <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
              <View style={styles.dateBadge}>
                <Text style={[styles.dateBadgeText, { color: colors.primary }]}>{formatDate(item.date)}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardCategory, { color: colors.primary }]}>{item.category}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.cardRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.cardLocation} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
                <Text style={styles.cardPrice}>a partir de R$ {lowestPrice(item).toFixed(2)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  categoryList: { marginTop: 14, flexGrow: 0 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  categoryChipTextSelected: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardImage: { width: '100%', height: 160, backgroundColor: '#E5E7EB' },
  dateBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardBody: { padding: 14, gap: 4 },
  cardCategory: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLocation: { fontSize: 13, color: '#6B7280', flexShrink: 1 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#059669', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
});
