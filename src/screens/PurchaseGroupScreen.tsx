import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { BuyerStackParamList } from '../navigation/types';
import { purchaseGroup } from '../api/groups';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<BuyerStackParamList, 'PurchaseGroup'>;

interface AttendeeInput {
  name: string;
  email: string;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function PurchaseGroupScreen({ route, navigation }: Props) {
  const { groupId, groupName, size, price } = route.params;
  const [attendees, setAttendees] = useState<AttendeeInput[]>(
    Array.from({ length: size }, () => ({ name: '', email: '' }))
  );
  const [isBuying, setIsBuying] = useState(false);

  const updateAttendee = (idx: number, field: keyof AttendeeInput, value: string) => {
    setAttendees((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };

  const handleBuy = async () => {
    const trimmed = attendees.map((a) => ({ name: a.name.trim(), email: a.email.trim() }));
    if (trimmed.some((a) => !a.name)) {
      Alert.alert('Ops', 'Preencha o nome de todas as pessoas da mesa.');
      return;
    }
    if (trimmed.some((a) => a.email && !isValidEmail(a.email))) {
      Alert.alert('Ops', 'O email informado não é válido. Deixe em branco se não tiver.');
      return;
    }

    setIsBuying(true);
    try {
      const payload = trimmed.map((a) => ({ name: a.name, email: a.email || undefined }));
      const { checkoutUrl } = await purchaseGroup(groupId, payload);
      await WebBrowser.openBrowserAsync(checkoutUrl);
      Alert.alert(
        'Pagamento em andamento',
        'Assim que o pagamento for confirmado, quem tiver email recebe o QR code automaticamente. Os demais aparecem em "Meus Ingressos" pra você compartilhar.'
      );
      navigation.goBack();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível comprar a mesa.';
      Alert.alert('Não foi possível comprar', message);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.title}>{groupName}</Text>
      <Text style={styles.subtitle}>
        {size} {size === 1 ? 'pessoa' : 'pessoas'} · R$ {price.toFixed(2)} no total
      </Text>
      <Text style={styles.hint}>
        Informe o nome de cada pessoa. O email é opcional — se preenchido, essa pessoa recebe o QR code
        automaticamente por email; senão, você pode compartilhar depois em "Meus Ingressos".
      </Text>

      {attendees.map((attendee, idx) => (
        <View key={idx} style={styles.attendeeBlock}>
          <Text style={styles.label}>Pessoa {idx + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome completo"
            placeholderTextColor="#9CA3AF"
            value={attendee.name}
            onChangeText={(text) => updateAttendee(idx, 'name', text)}
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Email (opcional)"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            value={attendee.email}
            onChangeText={(text) => updateAttendee(idx, 'email', text)}
          />
        </View>
      ))}

      <PrimaryButton
        title={`Comprar · R$ ${price.toFixed(2)}`}
        onPress={handleBuy}
        loading={isBuying}
        style={{ marginTop: 28 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 12, marginBottom: 8 },
  attendeeBlock: { marginTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
});
