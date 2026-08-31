import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../api/client';
import GoogleButton from '../components/GoogleButton';
import PrimaryButton from '../components/PrimaryButton';
import PasswordInput from '../components/PasswordInput';
import { AuthStackParamList } from '../navigation/types';
import { UserRole } from '../types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const register = useAuthStore((s) => s.register);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Ops', 'Preencha nome, email e senha.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha fraca', 'Use pelo menos 6 caracteres.');
      return;
    }
    if (!role) {
      Alert.alert('Ops', 'Selecione um perfil para continuar.');
      return;
    }
    try {
      await register(name.trim(), email.trim(), password, role);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar sua conta.';
      Alert.alert('Erro ao cadastrar', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </Pressable>

        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Comece a comprar ou divulgar eventos em minutos</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Maria Silva"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="voce@email.com"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Senha</Text>
        <PasswordInput
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Como você quer usar o app?</Text>

        <Pressable
          style={[
            styles.roleCard,
            role === 'buyer' && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
          ]}
          onPress={() => setRole('buyer')}
        >
          <Ionicons name="search" size={26} color={role === 'buyer' ? colors.primary : '#374151'} />
          <View style={styles.roleTextWrap}>
            <Text style={[styles.roleTitle, role === 'buyer' && { color: colors.primary }]}>
              Comprar ingressos
            </Text>
            <Text style={styles.roleDesc}>Explorar eventos e comprar ingressos</Text>
          </View>
        </Pressable>

        <Pressable
          style={[
            styles.roleCard,
            role === 'organizer' && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
          ]}
          onPress={() => setRole('organizer')}
        >
          <Ionicons name="megaphone" size={26} color={role === 'organizer' ? colors.primary : '#374151'} />
          <View style={styles.roleTextWrap}>
            <Text style={[styles.roleTitle, role === 'organizer' && { color: colors.primary }]}>
              Divulgar eventos
            </Text>
            <Text style={styles.roleDesc}>Criar e gerenciar seus próprios eventos</Text>
          </View>
        </Pressable>

        <PrimaryButton
          title="Criar conta"
          onPress={handleRegister}
          loading={isSubmitting}
          style={{ marginTop: 28 }}
        />

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.divider} />
        </View>

        <GoogleButton
          pendingRole={role ?? undefined}
          onError={(message) => Alert.alert('Erro ao entrar com Google', message)}
        />
        {!role && (
          <Text style={styles.googleHint}>Selecione um perfil acima antes de usar o Google.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backButton: { marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    gap: 14,
  },
  roleTextWrap: { flex: 1 },
  roleTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  roleDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  divider: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 12, color: '#9CA3AF' },
  googleHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 10 },
});
