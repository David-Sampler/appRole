import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import PrimaryButton from '../components/PrimaryButton';
import { BuyerStackParamList } from '../navigation/types';
import { getEvent, purchaseTicket } from '../api/events';
import { ApiError } from '../api/client';
import { Event } from '../types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<BuyerStackParamList, 'EventDetail'>;

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function EventDetailScreen({ route }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isBuying, setIsBuying] = useState(false);

  const fetchEvent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { event: fetched } = await getEvent(eventId);
      setEvent(fetched);
      setSelectedTypeId((prev) => prev ?? fetched.ticketTypes[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o evento.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      fetchEvent();
    }, [fetchEvent])
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

  const selectedType = event.ticketTypes.find((tt) => tt.id === selectedTypeId);
  const remaining = selectedType
    ? selectedType.quantityAvailable - selectedType.quantitySold
    : 0;
  const total = selectedType ? selectedType.price * quantity : 0;

  const handleBuy = async () => {
    if (!selectedType) return;
    setIsBuying(true);
    try {
      const { checkoutUrl } = await purchaseTicket(event.id, selectedType.id, quantity);
      await WebBrowser.openBrowserAsync(checkoutUrl);
      Alert.alert(
        'Pagamento em andamento',
        'Assim que o pagamento for confirmado, seu ingresso aparecerá em "Meus Ingressos".'
      );
      setQuantity(1);
      fetchEvent();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível comprar o ingresso.';
      Alert.alert('Não foi possível comprar', message);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
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
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
            <Text style={styles.infoText}>Organizado por {event.organizerName}</Text>
          </View>

          <Text style={styles.sectionTitle}>Sobre o evento</Text>
          <Text style={styles.description}>{event.description}</Text>

          <Text style={styles.sectionTitle}>Ingressos</Text>
          {event.ticketTypes.map((tt) => {
            const left = tt.quantityAvailable - tt.quantitySold;
            const soldOut = left <= 0;
            const selected = tt.id === selectedTypeId;
            return (
              <Pressable
                key={tt.id}
                disabled={soldOut}
                onPress={() => {
                  setSelectedTypeId(tt.id);
                  setQuantity(1);
                }}
                style={[
                  styles.ticketOption,
                  selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  soldOut && styles.ticketOptionDisabled,
                ]}
              >
                <View>
                  <Text style={styles.ticketName}>{tt.name}</Text>
                  <Text style={styles.ticketLeft}>
                    {soldOut ? 'Esgotado' : `${left} disponíveis`}
                  </Text>
                </View>
                <Text style={styles.ticketPrice}>R$ {tt.price.toFixed(2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {selectedType && remaining > 0 && (
        <View style={styles.footer}>
          <View style={styles.qtyRow}>
            <Pressable
              style={[styles.qtyButton, { backgroundColor: colors.primaryLight }]}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove" size={18} color={colors.primary} />
            </Pressable>
            <Text style={styles.qtyText}>{quantity}</Text>
            <Pressable
              style={[styles.qtyButton, { backgroundColor: colors.primaryLight }]}
              onPress={() => setQuantity((q) => Math.min(remaining, q + 1))}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <PrimaryButton
            title={`Comprar · R$ ${total.toFixed(2)}`}
            onPress={handleBuy}
            loading={isBuying}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#E5E7EB' },
  body: { padding: 20 },
  category: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  infoText: { fontSize: 14, color: '#374151' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 24, marginBottom: 8 },
  description: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
  ticketOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  ticketOptionDisabled: { opacity: 0.5 },
  ticketName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  ticketLeft: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  ticketPrice: { fontSize: 16, fontWeight: '700', color: '#059669' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 16, fontWeight: '700', minWidth: 20, textAlign: 'center' },
});
