import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { BuyerStackParamList } from '../navigation/types';
import { purchaseGroup } from '../api/groups';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<BuyerStackParamList, 'PurchaseGroup'>;

export default function PurchaseGroupScreen({ route, navigation }: Props) {
  const { groupId, groupName, size, price } = route.params;
  const [names, setNames] = useState<string[]>(Array.from({ length: size }, () => ''));
  const [isBuying, setIsBuying] = useState(false);

  const handleBuy = async () => {
    const attendees = names.map((n) => n.trim());
    if (attendees.some((n) => !n)) {
      Alert.alert('Ops', 'Preencha o nome de todas as pessoas da mesa.');
      return;
    }

    setIsBuying(true);
    try {
      const { checkoutUrl } = await purchaseGroup(
        groupId,
        attendees.map((name) => ({ name }))
      );
      await WebBrowser.openBrowserAsync(checkoutUrl);
      Alert.alert(
        'Pagamento em andamento',
        'Assim que o pagamento for confirmado, os QR codes de cada pessoa aparecerão em "Meus Ingressos".'
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
        Informe o nome de cada pessoa. Cada uma recebe seu próprio QR code de entrada em "Meus Ingressos".
      </Text>

      {names.map((name, idx) => (
        <View key={idx}>
          <Text style={styles.label}>Pessoa {idx + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome completo"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={(text) =>
              setNames((prev) => prev.map((n, i) => (i === idx ? text : n)))
            }
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
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
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
