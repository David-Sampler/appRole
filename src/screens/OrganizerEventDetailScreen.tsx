import React, { useCallback, useState, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, Pressable, Share, Alert, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { OrganizerStackParamList } from '../navigation/types';
import { getEvent, eventBuyers, cancelEvent, deleteEvent, restoreEvent, purgeEvent, EventBuyer } from '../api/events';
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
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [imageHidden, setImageHidden] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const windowWidth = Dimensions.get('window').width;
  const imageHeight = (windowWidth * 9) / 16;

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('DeletedEvents')} style={{ marginRight: 12 }} hitSlop={8}>
          <Ionicons name="archive-outline" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

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
  const isCancelled = event.status === 'cancelled';
  const isDeleted = event.status === 'deleted';

  const handleCancelEvent = () => {
    Alert.alert(
      'Cancelar evento',
      'Tem certeza que deseja cancelar este evento? Ele deixará de aparecer para compradores.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar evento',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const { event: updated } = await cancelEvent(event.id);
              setEvent(updated);
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível cancelar o evento.';
              Alert.alert('Erro', message);
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteEvent = () => {
    Alert.alert(
      'Remover evento',
      'Tem certeza que deseja remover este evento? Esta ação ocultará o evento permanentemente dos compradores.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
            onPress: async () => {
            setIsDeleting(true);
            try {
              const { event: updated } = await deleteEvent(event.id);
              setEvent(updated);
              Alert.alert('Evento removido', 'O evento foi removido com sucesso.');
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível remover o evento.';
              Alert.alert('Erro', message);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreEvent = () => {
    Alert.alert(
      'Restaurar evento',
      'Deseja restaurar este evento para ficar disponível novamente para compradores?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const { event: updated } = await restoreEvent(event.id);
              setEvent(updated);
              Alert.alert('Restaurado', 'O evento foi restaurado com sucesso.');
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível restaurar o evento.';
              Alert.alert('Erro', message);
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handlePurgeEvent = () => {
    Alert.alert(
      'Apagar permanentemente',
      'Esta ação apagará o evento e todos os dados relacionados permanentemente. Deseja continuar?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              await purgeEvent(event.id);
              Alert.alert('Apagado', 'O evento foi apagado permanentemente.');
              navigation.goBack();
            } catch (err) {
              const message = err instanceof ApiError ? err.message : 'Não foi possível apagar o evento.';
              Alert.alert('Erro', message);
            }
          },
        },
      ]
    );
  };

  const hideImage = () => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setImageHidden(true));
  };

  const showImage = () => {
    slide.setValue(1);
    setImageHidden(false);
    Animated.timing(slide, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -imageHeight - 20],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {!imageHidden && (
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Image source={{ uri: event.imageUrl }} style={styles.image} />
          <Pressable style={styles.hideButton} onPress={hideImage}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      {imageHidden && (
        <Pressable style={[styles.showButton, { backgroundColor: colors.primary }]} onPress={showImage}>
          <Ionicons name="image" size={18} color="#fff" />
        </Pressable>
      )}

      <View style={styles.body}>
        <View style={styles.categoryRow}>
          <Text style={[styles.category, { color: colors.primary }]}>{event.category}</Text>
          {isCancelled && (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledBadgeText}>Evento cancelado</Text>
            </View>
          )}
          {isDeleted && (
            <View style={styles.deletedBadge}>
              <Text style={styles.deletedBadgeText}>Evento removido</Text>
            </View>
          )}
        </View>
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

        <Pressable
          style={[styles.shareButton, { borderColor: colors.primary, marginTop: 12 }]}
          onPress={() => navigation.navigate('Groups', { eventId: event.id })}
        >
          <Ionicons name="grid-outline" size={18} color={colors.primary} />
          <Text style={[styles.shareButtonText, { color: colors.primary }]}>Mesas</Text>
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

        {!isCancelled && !isDeleted && (
          <View style={styles.shareRow}>
            <Pressable
              style={[styles.shareButton, { borderColor: colors.primary }]}
              onPress={() => navigation.navigate('CreateEvent', { eventId: event.id })}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={[styles.shareButtonText, { color: colors.primary }]}>Editar evento</Text>
            </Pressable>
            <Pressable
              style={[styles.shareButton, styles.cancelButton]}
              onPress={handleCancelEvent}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={[styles.shareButtonText, { color: '#DC2626' }]}>Cancelar evento</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.shareButton, styles.deleteButton]}
              onPress={handleDeleteEvent}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  <Text style={[styles.shareButtonText, { color: '#DC2626' }]}>Remover evento</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {isDeleted && (
          <View style={styles.shareRow}>
            <Pressable
              style={[styles.shareButton, { borderColor: colors.primary }]}
              onPress={handleRestoreEvent}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                  <Text style={[styles.shareButtonText, { color: colors.primary }]}>Restaurar evento</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.shareButton, styles.deleteButton]}
              onPress={handlePurgeEvent}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <Text style={[styles.shareButtonText, { color: '#DC2626' }]}>Apagar permanentemente</Text>
            </Pressable>
          </View>
        )}

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
                <Text style={styles.buyerName}>{b.attendeeName ?? b.buyerName}</Text>
                <Text style={styles.buyerSub}>
                  {b.groupName ? `Mesa: ${b.groupName}` : `${b.quantity}x ${b.ticketTypeName}`} ·{' '}
                  {formatDateTime(b.purchasedAt)}
                </Text>
                {b.groupName && <Text style={styles.buyerSub}>Comprou: {b.buyerName}</Text>}
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
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#E5E7EB' },
  body: { padding: 20 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cancelledBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cancelledBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
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
  deleteButton: { borderColor: '#DC2626' },
  shareButtonText: { fontSize: 13, fontWeight: '700' },
  cancelButton: { borderColor: '#DC2626' },
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
  hideButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  showButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  deletedBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  deletedBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
});

