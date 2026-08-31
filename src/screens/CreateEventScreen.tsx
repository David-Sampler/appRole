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
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { createEvent as createEventApi, updateEvent as updateEventApi, getEvent } from '../api/events';
import { uploadEventImage } from '../api/uploads';
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

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeKey(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

function parseTimeKey(key: string) {
  const [h, m] = key.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
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
  const [dateObj, setDateObj] = useState(new Date());
  const [timeObj, setTimeObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [isLocatingCity, setIsLocatingCity] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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
          setDateObj(parseDateKey(event.date));
          setTimeObj(parseTimeKey(event.time));
          setLocation(event.location);
          setCity(event.city);
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
    setDateObj(new Date());
    setTimeObj(new Date());
    setLocation('');
    setCity('');
    setImageUrl('');
    setTicketTypes([{ key: '1', name: 'Inteira', price: '', quantity: '' }]);
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos pra escolher a imagem do evento.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploadingImage(true);
    try {
      const { url } = await uploadEventImage(result.assets[0].uri);
      setImageUrl(url);
    } catch (err) {
      console.error('Falha no upload da imagem:', err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? `Não foi possível enviar a imagem (${err.message}).`
          : 'Não foi possível enviar a imagem.';
      Alert.alert('Erro', message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selected) setDateObj(selected);
    } else if (selected) {
      setDateObj(selected);
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'set' && selected) setTimeObj(selected);
    } else if (selected) {
      setTimeObj(selected);
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocatingCity(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos da sua localização pra sugerir a cidade.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (address?.city) {
        setCity(address.region ? `${address.city} - ${address.region}` : address.city);
      } else {
        Alert.alert('Não encontramos sua cidade', 'Digite manualmente, por favor.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    } finally {
      setIsLocatingCity(false);
    }
  };

  const handleSubmit = async () => {
    if (isUploadingImage) {
      Alert.alert('Aguarde', 'A imagem ainda está sendo enviada.');
      return;
    }
    const missingFields: string[] = [];
    if (!title.trim()) missingFields.push('Título do evento');
    if (!description.trim()) missingFields.push('Descrição');
    if (!location.trim()) missingFields.push('Local');
    if (!city.trim()) missingFields.push('Cidade');
    if (missingFields.length > 0) {
      Alert.alert('Campos obrigatórios', `Preencha: ${missingFields.join(', ')}.`);
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
          date: toDateKey(dateObj),
          time: toTimeKey(timeObj),
          location: location.trim(),
          city: city.trim(),
          imageUrl: imageUrl.trim() || undefined,
          ticketTypes: parsedTicketTypes,
        });
        Alert.alert('Evento atualizado!', 'As alterações já estão visíveis para os compradores.');
      } else {
        await createEventApi({
          title: title.trim(),
          description: description.trim(),
          category,
          date: toDateKey(dateObj),
          time: toTimeKey(timeObj),
          location: location.trim(),
          city: city.trim(),
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
          <Text style={styles.label}>Data</Text>
          <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerValueText}>
              {dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Horário</Text>
          <Pressable style={styles.input} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerValueText}>
              {timeObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Pressable>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleDateChange}
        />
      )}
      {Platform.OS === 'ios' && showDatePicker && (
        <Pressable style={styles.pickerDoneButton} onPress={() => setShowDatePicker(false)}>
          <Text style={[styles.pickerDoneText, { color: colors.primary }]}>Concluir</Text>
        </Pressable>
      )}

      {showTimePicker && (
        <DateTimePicker
          value={timeObj}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
      {Platform.OS === 'ios' && showTimePicker && (
        <Pressable style={styles.pickerDoneButton} onPress={() => setShowTimePicker(false)}>
          <Text style={[styles.pickerDoneText, { color: colors.primary }]}>Concluir</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Local</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Ex: Arena Music Hall" placeholderTextColor="#9CA3AF" />

      <View style={styles.cityLabelRow}>
        <Text style={styles.label}>Cidade</Text>
        <Pressable style={styles.useLocationButton} onPress={handleUseCurrentLocation} disabled={isLocatingCity}>
          {isLocatingCity ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="locate-outline" size={14} color={colors.primary} />
              <Text style={[styles.useLocationText, { color: colors.primary }]}>Usar minha localização</Text>
            </>
          )}
        </Pressable>
      </View>
      <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Ex: São Paulo - SP" placeholderTextColor="#9CA3AF" />

      <Text style={styles.label}>Imagem de capa</Text>
      <Pressable style={styles.imagePicker} onPress={handlePickImage} disabled={isUploadingImage}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color="#9CA3AF" />
            <Text style={styles.imagePlaceholderText}>Toque para escolher uma foto</Text>
          </View>
        )}
        {isUploadingImage && (
          <View style={styles.imageUploadingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {!!imageUrl && !isUploadingImage && (
          <View style={styles.imageChangeBadge}>
            <Ionicons name="camera-outline" size={14} color="#fff" />
            <Text style={styles.imageChangeBadgeText}>Trocar</Text>
          </View>
        )}
      </Pressable>

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
        disabled={isUploadingImage}
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
  pickerValueText: { fontSize: 15, color: '#111827', textTransform: 'capitalize' },
  cityLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  useLocationButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  useLocationText: { fontSize: 12, fontWeight: '700' },
  pickerDoneButton: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  pickerDoneText: { fontWeight: '700', fontSize: 14 },
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
  imagePicker: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  imagePlaceholderText: { fontSize: 13, color: '#9CA3AF' },
  imageUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageChangeBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  imageChangeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
