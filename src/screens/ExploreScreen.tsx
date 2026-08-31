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
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { listEvents, listCities } from '../api/events';
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
  const [city, setCity] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
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
        city: city || undefined,
      });
      setEvents(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os eventos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [query, category, city]);

  useFocusEffect(
    useCallback(() => {
      fetchEvents({ silent: true });
    }, [fetchEvents])
  );

  useEffect(() => {
    listCities()
      .then(({ cities: fetched }) => setCities(fetched))
      .catch(() => {
        // filtro de cidade fica indisponível se a busca de cidades falhar, sem bloquear a tela
      });
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchEvents(), 300);
    return () => clearTimeout(timeout);
  }, [query, category, city]);

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

      {cities.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={cities}
          keyExtractor={(item) => item}
          style={styles.cityList}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.cityChip,
                city === item && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
              onPress={() => setCity(city === item ? null : item)}
            >
              <Ionicons
                name="location-outline"
                size={13}
                color={city === item ? colors.primary : '#6B7280'}
              />
              <Text style={[styles.cityChipText, city === item && { color: colors.primary }]}>{item}</Text>
            </Pressable>
          )}
        />
      )}

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
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                locations={[0, 0.7]}
                style={styles.cardOverlay}
              >
                <Text style={styles.cardCategory}>{item.category}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.cardBottomRow}>
                  <View style={styles.cardRow}>
                    <Ionicons name="location-outline" size={13} color="#E5E7EB" />
                    <Text style={styles.cardLocation} numberOfLines={1}>
                      {item.location}{item.city ? ` · ${item.city}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.cardPrice}>a partir de R$ {lowestPrice(item).toFixed(2)}</Text>
                </View>
              </LinearGradient>
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
  cityList: { marginTop: 8, flexGrow: 0 },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cityChipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  cardImage: { width: '100%', aspectRatio: 1.9, backgroundColor: '#E5E7EB' },
  dateBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBadgeText: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  cardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 36,
    paddingBottom: 12,
    gap: 2,
  },
  cardCategory: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#E9D5FF' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  cardLocation: { fontSize: 14, color: '#E5E7EB', flexShrink: 1 },
  cardPrice: { fontSize: 15, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
});
