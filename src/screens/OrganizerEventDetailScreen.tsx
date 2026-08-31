import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, Pressable, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { OrganizerStackParamList } from '../navigation/types';
import { getEvent, eventBuyers, EventBuyer } from '../api/events';
import { ApiError } from '../api/client';
import { eventCheckoutUrl } from '../utils/publicUrl';
import { Event } from '../types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'OrganizerEventDetail'>;

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function OrganizerEventDetailScreen({ route, navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [buyers, setBuyers] = useState<EventBuyer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [{ event: fetchedEvent }, { tickets }] = await Promise.all([
        getEvent(eventId),
        eventBuyers(eventId),
      ]);
      setEvent(fetchedEvent);
      setBuyers(tickets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o evento.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centered}>
        <Text>{error ?? 'Evento não encontrado.'}</Text>
      </View>
    );
  }

  const totalRevenue = event.ticketTypes.reduce((sum, tt) => sum + tt.quantitySold * tt.price, 0);
  const totalSold = event.ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Image source={{ uri: event.imageUrl }} style={styles.image} />

      <View style={styles.body}>
        <Text style={[styles.category, { color: colors.primary }]}>{event.category}</Text>
        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            {formatDate(event.date)} às {event.time}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>{event.location}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{totalSold}</Text>
            <Text style={styles.summaryLabel}>ingressos vendidos</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>R$ {totalRevenue.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>receita total</Text>
          </View>
        </View>

        <Pressable
          style={styles.scanButton}
          onPress={() => navigation.navigate('CheckInScanner', { eventId: event.id })}
        >
          <Ionicons name="qr-code-outline" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Validar ingressos na entrada</Text>
        </Pressable>

        <View style={styles.shareRow}>
          <Pressable
            style={[styles.shareButton, { borderColor: colors.primary }]}
            onPress={async () => {
              const url = eventCheckoutUrl(event.id);
              try {
                await Share.share({ message: `Garanta seu ingresso para ${event.title}: ${url}` });
              } catch {
                // usuário cancelou o compartilhamento, nada a fazer
              }
            }}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.primary} />
            <Text style={[styles.shareButtonText, { color: colors.primary }]}>Compartilhar</Text>
          </Pressable>
          <Pressable
            style={[styles.shareButton, { borderColor: colors.primary }]}
            onPress={async () => {
              await Clipboard.setStringAsync(eventCheckoutUrl(event.id));
              Alert.alert('Link copiado', 'O link de compra foi copiado para a área de transferência.');
            }}
          >
            <Ionicons name="copy-outline" size={18} color={colors.primary} />
            <Text style={[styles.shareButtonText, { color: colors.primary }]}>Copiar link</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Ingressos por tipo</Text>
        {event.ticketTypes.map((tt) => {
          const left = tt.quantityAvailable - tt.quantitySold;
          return (
            <View key={tt.id} style={styles.ticketTypeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketTypeName}>{tt.name}</Text>
                <Text style={styles.ticketTypeSub}>
                  {tt.quantitySold} vendidos · {left} disponíveis · R$ {tt.price.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.ticketTypeRevenue}>
                R$ {(tt.quantitySold * tt.price).toFixed(2)}
              </Text>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Compradores ({buyers.length})</Text>
        {buyers.length === 0 ? (
          <View style={styles.emptyBuyers}>
            <Ionicons name="people-outline" size={36} color="#D1D5DB" />
            <Text style={styles.emptyBuyersText}>Ninguém comprou ingressos ainda</Text>
          </View>
        ) : (
          buyers.map((b) => (
            <View key={b.id} style={styles.buyerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.buyerName}>{b.buyerName}</Text>
                <Text style={styles.buyerSub}>
                  {b.quantity}x {b.ticketTypeName} · {formatDateTime(b.purchasedAt)}
                </Text>
                <Text style={[styles.buyerCode, { color: colors.primary }]}>Código: {b.code}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.buyerTotal}>R$ {b.totalPaid.toFixed(2)}</Text>
                {b.status === 'pending_payment' && (
                  <Text style={styles.pendingBadgeText}>Aguardando pagamento</Text>
                )}
                {b.status === 'cancelled' && (
                  <Text style={styles.cancelledLabelText}>Cancelado</Text>
                )}
                {b.status === 'paid' &&
                  (b.checkedInAt ? (
                    <View style={styles.checkedInBadge}>
                      <Ionicons name="checkmark-circle" size={11} color="#059669" />
                      <Text style={styles.checkedInBadgeText}>Validado</Text>
                    </View>
                  ) : (
                    <Text style={styles.pendingBadgeText}>Aguardando check-in</Text>
                  ))}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: 200, backgroundColor: '#E5E7EB' },
  body: { padding: 20 },
  category: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  infoText: { fontSize: 14, color: '#374151' },
  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'center' },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 16,
  },
  scanButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
  },
  shareButtonText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 28, marginBottom: 8 },
  ticketTypeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  ticketTypeName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  ticketTypeSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  ticketTypeRevenue: { fontSize: 14, fontWeight: '700', color: '#059669' },
  emptyBuyers: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyBuyersText: { color: '#9CA3AF', fontSize: 13 },
  buyerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  buyerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  buyerSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  buyerCode: { fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  buyerTotal: { fontSize: 13, fontWeight: '700', color: '#059669' },
  checkedInBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  checkedInBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  pendingBadgeText: { fontSize: 10, color: '#9CA3AF' },
  cancelledLabelText: { fontSize: 10, color: '#DC2626', fontWeight: '700' },
});
