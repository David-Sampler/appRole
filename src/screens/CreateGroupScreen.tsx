import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { createGroup } from '../api/groups';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const colors = useThemeStore((s) => s.colors);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const sizeNumber = Number(size);
    const priceNumber = Number(price.replace(',', '.'));

    if (!name.trim()) {
      Alert.alert('Ops', 'Informe o nome da mesa.');
      return;
    }
    if (!Number.isInteger(sizeNumber) || sizeNumber <= 0) {
      Alert.alert('Ops', 'Informe um número de pessoas válido.');
      return;
    }
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      Alert.alert('Ops', 'Informe um valor válido para a mesa.');
      return;
    }

    setIsSaving(true);
    try {
      await createGroup(eventId, { name: name.trim(), size: sizeNumber, price: priceNumber });
      navigation.goBack();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar a mesa.';
      Alert.alert('Erro', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.label}>Nome da mesa</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Mesa VIP"
        placeholderTextColor="#9CA3AF"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Número de pessoas</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: 4"
        placeholderTextColor="#9CA3AF"
        keyboardType="number-pad"
        value={size}
        onChangeText={setSize}
      />

      <Text style={styles.label}>Valor da mesa (R$)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: 400.00"
        placeholderTextColor="#9CA3AF"
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
      />
      <Text style={styles.hint}>
        Esse é o valor total da mesa, cobrado uma única vez. Cada pessoa recebe seu próprio QR code de entrada.
      </Text>

      <PrimaryButton title="Criar mesa" onPress={handleSave} loading={isSaving} style={{ marginTop: 28 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
});
