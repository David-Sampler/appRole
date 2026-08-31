import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { createEvent as createEventApi, updateEvent as updateEventApi, getEvent } from '../api/events';
import { ApiError } from '../api/client';
import { CATEGORIES } from '../data/categories';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'CreateEvent'>;

interface DraftTicketType {
  key: string;
  id?: string;
  name: string;
  price: string;
  quantity: string;
}

export default function CreateEventScreen({ navigation, route }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const currentUser = useAuthStore((s) => s.user);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const eventId = route.params?.eventId;
  const isEditing = Boolean(eventId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);

  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ticketTypes, setTicketTypes] = useState<DraftTicketType[]>([
    { key: '1', name: 'Inteira', price: '', quantity: '' },
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!eventId) return;
      let cancelled = false;
      setIsLoading(true);
      getEvent(eventId)
        .then(({ event }) => {
          if (cancelled) return;
          setTitle(event.title);
          setCategory(event.category);
          setDescription(event.description);
          setDate(event.date);
          setTime(event.time);
          setLocation(event.location);
          setImageUrl(event.imageUrl);
          setTicketTypes(
            event.ticketTypes.map((tt) => ({
              key: tt.id,
              id: tt.id,
              name: tt.name,
              price: String(tt.price),
              quantity: String(tt.quantityAvailable),
            }))
          );
        })
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : 'Não foi possível carregar o evento.';
          Alert.alert('Erro', message);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [eventId])
  );

  const addTicketType = () => {
    setTicketTypes((prev) => [
      ...prev,
      { key: String(Date.now()), name: '', price: '', quantity: '' },
    ]);
  };

  const removeTicketType = (key: string) => {
    setTicketTypes((prev) => prev.filter((tt) => tt.key !== key));
  };

  const updateTicketType = (key: string, field: keyof DraftTicketType, value: string) => {
    setTicketTypes((prev) =>
      prev.map((tt) => (tt.key === key ? { ...tt, [field]: value } : tt))
    );
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDate('');
    setTime('');
    setLocation('');
    setImageUrl('');
    setTicketTypes([{ key: '1', name: 'Inteira', price: '', quantity: '' }]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !date.trim() || !time.trim() || !location.trim()) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos do evento.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Data inválida', 'Use o formato AAAA-MM-DD, ex: 2026-12-25.');
      return;
    }

    const parsedTicketTypes = [];
    for (const tt of ticketTypes) {
      if (!tt.name.trim()) {
        Alert.alert('Ingresso incompleto', 'Dê um nome para cada tipo de ingresso.');
        return;
      }
      const price = Number(tt.price.replace(',', '.'));
      const quantity = Number(tt.quantity);
      if (Number.isNaN(price) || price < 0) {
        Alert.alert('Preço inválido', `Verifique o preço do ingresso "${tt.name}".`);
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        Alert.alert('Quantidade inválida', `Verifique a quantidade do ingresso "${tt.name}".`);
        return;
      }
      parsedTicketTypes.push({ id: tt.id, name: tt.name.trim(), price, quantityAvailable: quantity });
    }

    setIsSubmitting(true);
    try {
      if (isEditing && eventId) {
        await updateEventApi(eventId, {
          title: title.trim(),
          description: description.trim(),
          category,
          date: date.trim(),
          time: time.trim(),
          location: location.trim(),
          imageUrl: imageUrl.trim() || undefined,
          ticketTypes: parsedTicketTypes,
        });
        Alert.alert('Evento atualizado!', 'As alterações já estão visíveis para os compradores.');
      } else {
        await createEventApi({
          title: title.trim(),
          description: description.trim(),
          category,
          date: date.trim(),
          time: time.trim(),
          location: location.trim(),
          imageUrl: imageUrl.trim() || undefined,
          ticketTypes: parsedTicketTypes,
        });
        Alert.alert('Evento publicado!', 'Seu evento já está visível para os compradores.');
        resetForm();
      }
      navigation.navigate('MyEvents');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `Não foi possível ${isEditing ? 'salvar' : 'publicar'} o evento.`;
      Alert.alert(`Erro ao ${isEditing ? 'salvar' : 'publicar'}`, message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const needsVerification = !isEditing && currentUser?.role === 'organizer' && !currentUser.isVerified;

  const handleVerify = async () => {
    if (!verifyCode.trim()) {
      Alert.alert('Código obrigatório', 'Digite o código enviado para o seu email.');
      return;
    }
    setIsVerifying(true);
    try {
      await verifyEmail(verifyCode.trim());
      setVerifyCode('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível verificar o código.';
      Alert.alert('Erro', message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await resendVerification();
      Alert.alert('Código reenviado', 'Confira sua caixa de entrada.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível reenviar o código.';
      Alert.alert('Erro', message);
    } finally {
      setIsResending(false);
    }
  };

  if (needsVerification) {
    return (
      <View style={styles.container}>
        <View style={styles.verifyCard}>
          <Ionicons name="mail-unread-outline" size={40} color={colors.primary} />
          <Text style={styles.verifyTitle}>Confirme seu email</Text>
          <Text style={styles.verifyDesc}>
            Enviamos um código para {currentUser?.email}. Confirme para poder publicar eventos.
          </Text>
          <TextInput
            style={[styles.input, styles.verifyInput]}
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="Código de 6 dígitos"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />
          <PrimaryButton title="Confirmar" onPress={handleVerify} loading={isVerifying} style={{ width: '100%' }} />
          <Pressable onPress={handleResend} disabled={isResending} style={{ marginTop: 16 }}>
            <Text style={[styles.resendText, { color: colors.primary }]}>
              {isResending ? 'Reenviando...' : 'Reenviar código'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={styles.label}>Título do evento</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Festival de Verão" placeholderTextColor="#9CA3AF" />

      <Text style={styles.label}>Categoria</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              style={[
                styles.categoryChip,
                category === c && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextSelected]}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Conte os detalhes do evento"
        placeholderTextColor="#9CA3AF"
        multiline
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Data (AAAA-MM-DD)</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-12-25" placeholderTextColor="#9CA3AF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Horário</Text>
          <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="20:00" placeholderTextColor="#9CA3AF" />
        </View>
      </View>

      <Text style={styles.label}>Local</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Ex: Arena Music Hall, São Paulo - SP" placeholderTextColor="#9CA3AF" />

      <Text style={styles.label}>URL da imagem (opcional)</Text>
      <TextInput style={styles.input} value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." placeholderTextColor="#9CA3AF" />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tipos de ingresso</Text>
        <Pressable style={styles.addTicketButton} onPress={addTicketType}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={[styles.addTicketText, { color: colors.primary }]}>Adicionar</Text>
        </Pressable>
      </View>

      {ticketTypes.map((tt, index) => (
        <View key={tt.key} style={styles.ticketBlock}>
          <View style={styles.ticketBlockHeader}>
            <Text style={styles.ticketBlockTitle}>Ingresso {index + 1}</Text>
            {ticketTypes.length > 1 && (
              <Pressable onPress={() => removeTicketType(tt.key)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>
            )}
          </View>
          <TextInput
            style={styles.input}
            value={tt.name}
            onChangeText={(v) => updateTicketType(tt.key, 'name', v)}
            placeholder="Nome (ex: Pista, VIP)"
            placeholderTextColor="#9CA3AF"
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={tt.price}
                onChangeText={(v) => updateTicketType(tt.key, 'price', v)}
                placeholder="Preço (R$)"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={tt.quantity}
                onChangeText={(v) => updateTicketType(tt.key, 'quantity', v)}
                placeholder="Quantidade"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
      ))}

      <PrimaryButton
        title={isEditing ? 'Salvar alterações' : 'Publicar evento'}
        onPress={handleSubmit}
        loading={isSubmitting}
        style={{ marginTop: 32 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  verifyCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  verifyTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 14 },
  verifyDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 19 },
  verifyInput: { width: '100%', textAlign: 'center', letterSpacing: 4, fontSize: 18, marginBottom: 20, marginTop: 0 },
  resendText: { fontWeight: '700', fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  categoryChipTextSelected: { color: '#fff' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  addTicketButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addTicketText: { fontWeight: '700', fontSize: 13 },
  ticketBlock: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  ticketBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketBlockTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
});
