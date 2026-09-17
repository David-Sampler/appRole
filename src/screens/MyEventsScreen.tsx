import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { myEvents as myEventsApi } from '../api/events';
import { ApiError } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';
import { Event } from '../types';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'MyEvents'>;

function totalSold(event: Event) {
  return event.ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);
}

function totalAvailable(event: Event) {
  return event.ticketTypes.reduce((sum, tt) => sum + tt.quantityAvailable, 0);
}

function totalRevenue(event: Event) {
  return event.ticketTypes.reduce((sum, tt) => sum + tt.quantitySold * tt.price, 0);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MyEventsScreen({ navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const mercadoPagoConnected = useAuthStore((s) => s.user?.mercadoPagoConnected);
  const isVerified = useAuthStore((s) => s.user?.isVerified);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setError(null);
    try {
      const { events: fetched } = await myEventsApi();
      setEvents(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus eventos.');
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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isVerified === false && (
        <Pressable style={styles.banner} onPress={() => navigation.navigate('CreateEvent')}>
          <Ionicons name="mail-unread-outline" size={18} color="#B45309" />
          <Text style={styles.bannerText}>
            Confirme seu email de organizador para poder publicar eventos. Toque para verificar.
          </Text>
        </Pressable>
      )}
      {mercadoPagoConnected === false && (
        <Pressable
          style={styles.banner}
          onPress={() => navigation.getParent()?.navigate('Profile' as never)}
        >
          <Ionicons name="alert-circle" size={18} color="#B45309" />
          <Text style={styles.bannerText}>
            Conecte sua conta do Mercado Pago no Perfil para poder receber pelos ingressos vendidos.
          </Text>
        </Pressable>
      )}
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={error ? 'cloud-offline-outline' : 'megaphone-outline'}
              size={44}
              color="#D1D5DB"
            />
            <Text style={styles.emptyText}>
              {error ?? 'Você ainda não criou nenhum evento'}
            </Text>
            {!error && (
              <PrimaryButton
                title="Criar meu primeiro evento"
                onPress={() => navigation.navigate('CreateEvent')}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const sold = totalSold(item);
          const available = totalAvailable(item);
          const pct = available > 0 ? Math.round((sold / available) * 100) : 0;
          const onCardPress = item.status === 'deleted' ? undefined : () => navigation.navigate('OrganizerEventDetail', { eventId: item.id });

          const cardStyle = [styles.card, item.status === 'deleted' ? { opacity: 0.6 } : null];

          return (
            <Pressable style={cardStyle} onPress={onCardPress} disabled={item.status === 'deleted'}>
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.status === 'cancelled' && (
                    <View style={styles.cancelledBadge}>
                      <Text style={styles.cancelledBadgeText}>Cancelado</Text>
                    </View>
                  )}
                  {item.status === 'deleted' && (
                    <View style={styles.deletedBadge}>
                      <Text style={styles.deletedBadgeText}>Removido</Text>
                    </View>
                  )}
                  {item.status === 'deleted' && (
                    <Pressable onPress={() => navigation.navigate('OrganizerEventDetail', { eventId: item.id })} style={{ marginLeft: 6 }} hitSlop={8}>
                      <Ionicons name="arrow-forward-circle" size={20} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.date}>{formatDate(item.date)} · {item.location}</Text>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(pct, 100)}%`, backgroundColor: colors.primary },
                    ]}
                  />
                </View>
                <View style={styles.statsRow}>
                  <Text style={styles.statText}>{sold}/{available} ingressos vendidos</Text>
                  <Text style={styles.revenue}>R$ {totalRevenue(item).toFixed(2)}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('CreateEvent')}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bannerText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
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
  cancelledBadge: { backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  cancelledBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  deletedBadge: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  deletedBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  date: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  progressBar: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statText: { fontSize: 11, color: '#6B7280' },
  revenue: { fontSize: 12, fontWeight: '700', color: '#059669' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
