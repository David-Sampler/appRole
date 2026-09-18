import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { listGroups, checkInGroup, EventGroup } from '../api/groups';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'Groups'>;

export default function OrganizerGroupsScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const colors = useThemeStore((s) => s.colors);
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInCode, setCheckInCode] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const { groups: fetched } = await listGroups(eventId);
      setGroups(fetched);
    } catch {
      // silencioso: lista fica vazia
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
    }, [fetchGroups])
  );

  const handleCheckIn = async () => {
    if (!checkInCode.trim()) return;
    setIsCheckingIn(true);
    try {
      const { message } = await checkInGroup(checkInCode.trim());
      Alert.alert('Mesa validada', message);
      setCheckInCode('');
      fetchGroups();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível validar a mesa.';
      Alert.alert('Erro', message);
    } finally {
      setIsCheckingIn(false);
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
      <View style={styles.checkInRow}>
        <TextInput
          style={styles.checkInInput}
          placeholder="Código da mesa"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="characters"
          value={checkInCode}
          onChangeText={setCheckInCode}
        />
        <Pressable
          style={[styles.checkInButton, { backgroundColor: colors.primary }]}
          onPress={handleCheckIn}
          disabled={isCheckingIn}
        >
          {isCheckingIn ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          )}
        </Pressable>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="grid-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>Nenhuma mesa criada ainda</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {item.size} {item.size === 1 ? 'pessoa' : 'pessoas'} · Código: {item.code}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.price, { color: colors.primary }]}>R$ {item.price.toFixed(2)}</Text>
              <View style={[styles.badge, item.status === 'sold' ? styles.badgeSold : styles.badgeAvailable]}>
                <Text style={styles.badgeText}>{item.status === 'sold' ? 'Vendida' : 'Disponível'}</Text>
              </View>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <PrimaryButton title="Criar mesa" onPress={() => navigation.navigate('CreateGroup', { eventId })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  checkInRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0 },
  checkInInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  checkInButton: {
    width: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeAvailable: { backgroundColor: '#ECFDF5' },
  badgeSold: { backgroundColor: '#F3F4F6' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
});
