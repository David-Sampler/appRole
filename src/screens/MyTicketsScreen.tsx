import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect } from '@react-navigation/native';
import * as ticketsApi from '../api/tickets';
import { ApiError } from '../api/client';
import { PurchasedTicket } from '../types';
import { useThemeStore } from '../store/useThemeStore';
import { ticketViewUrl } from '../utils/publicUrl';

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function MyTicketsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const [tickets, setTickets] = useState<PurchasedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchTickets = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    setError(null);
    try {
      const { tickets: fetched } = await ticketsApi.myTickets();
      setTickets(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus ingressos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTickets({ silent: true });
    }, [fetchTickets])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTickets({ silent: true });
  };

  const handleCancelTicket = (ticket: PurchasedTicket) => {
    Alert.alert(
      'Cancelar ingresso',
      'Tem certeza que deseja cancelar este ingresso? O valor pago será reembolsado.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar ingresso',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(ticket.id);
            try {
              await ticketsApi.cancelTicket(ticket.id);
              await fetchTickets({ silent: true });
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível cancelar o ingresso.';
              Alert.alert('Erro', message);
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  const handleShareTicket = async (ticket: PurchasedTicket) => {
    const who = ticket.attendeeName ? ` (${ticket.attendeeName})` : '';
    try {
      await Share.share({
        message: `Seu ingresso para ${ticket.eventTitle}${who}: ${ticketViewUrl(ticket.code)}`,
      });
    } catch {
      // usuário cancelou o compartilhamento, nada a fazer
    }
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
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={error ? 'cloud-offline-outline' : 'ticket-outline'}
              size={44}
              color="#D1D5DB"
            />
            <Text style={styles.emptyText}>
              {error ?? 'Você ainda não comprou nenhum ingresso'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{item.eventTitle}</Text>
                <Text style={styles.ticketType}>
                  {item.quantity}x {item.ticketTypeName}
                </Text>
              </View>
              {item.status === 'pending_payment' && (
                <View style={styles.pendingBadge}>
                  <Ionicons name="time-outline" size={13} color="#D97706" />
                  <Text style={styles.pendingBadgeText}>Aguardando pagamento</Text>
                </View>
              )}
              {item.status === 'cancelled' && (
                <View style={styles.cancelledBadge}>
                  <Ionicons name="close-circle" size={13} color="#DC2626" />
                  <Text style={styles.cancelledBadgeText}>Cancelado</Text>
                </View>
              )}
              {item.status === 'paid' &&
                (item.checkedInAt ? (
                  <View style={styles.usedBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#059669" />
                    <Text style={styles.usedBadgeText}>Validado</Text>
                  </View>
                ) : (
                  <View style={[styles.validBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.validBadgeText, { color: colors.primary }]}>Válido</Text>
                  </View>
                ))}
            </View>

            {item.attendeeName && (
              <Text style={styles.attendeeName}>Convidado: {item.attendeeName}</Text>
            )}

            {item.status === 'paid' ? (
              <View style={[styles.qrWrapper, item.checkedInAt && styles.qrWrapperUsed]}>
                <QRCode value={item.code} size={160} />
              </View>
            ) : (
              <View style={styles.qrPlaceholder}>
                <Ionicons
                  name={item.status === 'pending_payment' ? 'hourglass-outline' : 'close-circle-outline'}
                  size={40}
                  color="#D1D5DB"
                />
                <Text style={styles.qrPlaceholderText}>
                  {item.status === 'pending_payment'
                    ? 'O QR code aparece assim que o pagamento for confirmado'
                    : 'Este ingresso foi cancelado'}
                </Text>
              </View>
            )}

            <View style={styles.divider} />
            <View style={styles.cardBottom}>
              <View>
                <Text style={styles.label}>Código</Text>
                <Text style={[styles.code, { color: colors.primary }]}>{item.code}</Text>
              </View>
              <View>
                <Text style={styles.label}>Total pago</Text>
                <Text style={styles.price}>R$ {item.totalPaid.toFixed(2)}</Text>
              </View>
              <View>
                <Text style={styles.label}>Comprado em</Text>
                <Text style={styles.date}>{formatDateTime(item.purchasedAt)}</Text>
              </View>
            </View>

            {item.status === 'paid' && (
              <Pressable style={styles.shareTicketButton} onPress={() => handleShareTicket(item)}>
                <Ionicons name="share-social-outline" size={16} color={colors.primary} />
                <Text style={[styles.shareTicketButtonText, { color: colors.primary }]}>Compartilhar</Text>
              </Pressable>
            )}

            {item.status === 'paid' && !item.checkedInAt && !item.groupId && (
              <Pressable
                style={styles.cancelTicketButton}
                onPress={() => handleCancelTicket(item)}
                disabled={cancellingId === item.id}
              >
                {cancellingId === item.id ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                    <Text style={styles.cancelTicketButtonText}>Cancelar ingresso</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  empty: { alignItems: 'center', paddingTop: 100, gap: 8 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  ticketType: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  attendeeName: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 10 },
  validBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  validBadgeText: { fontSize: 11, fontWeight: '700' },
  usedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  usedBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  cancelledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cancelledBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 20,
  },
  qrWrapperUsed: { opacity: 0.3 },
  qrPlaceholder: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  qrPlaceholderText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 30 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 12 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 11, color: '#9CA3AF', marginBottom: 2 },
  code: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  price: { fontSize: 13, fontWeight: '700', color: '#059669' },
  date: { fontSize: 12, color: '#374151' },
  cancelTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    paddingVertical: 10,
  },
  cancelTicketButtonText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  shareTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 10,
  },
  shareTicketButtonText: { fontSize: 12, fontWeight: '700' },
});
