import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { listDeletedEvents, purgeEvent } from '../api/events';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';
import { Event } from '../types';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'DeletedEvents'>;

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DeletedEventsScreen({ navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setError(null);
    try {
      const { events: fetched } = await listDeletedEvents();
      setEvents(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar eventos removidos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents({ silent: true });
    }, [fetchEvents])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEvents({ silent: true });
  };

  const handlePurge = (eventId: string) => {
    Alert.alert(
      'Apagar permanentemente',
      'Esta ação apagará o evento permanentemente. Deseja continuar?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              await purgeEvent(eventId);
              Alert.alert('Apagado', 'Evento apagado permanentemente.');
              fetchEvents({ silent: true });
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível apagar o evento.';
              Alert.alert('Erro', message);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={error ? 'cloud-offline-outline' : 'trash-outline'} size={44} color="#D1D5DB" />
            <Text style={styles.emptyText}>{error ?? 'Nenhum evento removido.'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('OrganizerEventDetail', { eventId: item.id })}
            >
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <View style={styles.deletedBadge}>
                    <Text style={styles.deletedBadgeText}>Removido</Text>
                  </View>
                </View>
                <Text style={styles.date}>{formatDate(item.date)} · {item.location}</Text>

                <View style={styles.statsRow}>
                  <Text style={styles.statText}>{item.ticketTypes.reduce((s, t) => s + t.quantitySold, 0)} vendidos</Text>
                  <Pressable onPress={() => handlePurge(item.id)}>
                    <Text style={{ color: '#DC2626', fontWeight: '700' }}>Apagar</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  empty: { alignItems: 'center', paddingTop: 90, gap: 12 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    flexDirection: 'row',
  },
  image: { width: 100, height: '100%', backgroundColor: '#E5E7EB' },
  body: { flex: 1, padding: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  deletedBadge: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  deletedBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  date: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
  statText: { fontSize: 11, color: '#6B7280' },
});
