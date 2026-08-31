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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import PasswordInput from '../components/PasswordInput';
import { AuthStackParamList } from '../navigation/types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const handleSubmit = async () => {
    if (!code.trim() || !newPassword) {
      Alert.alert('Ops', 'Preencha o código e a nova senha.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Senha fraca', 'Use pelo menos 6 caracteres.');
      return;
    }
    try {
      await resetPassword(email, code.trim(), newPassword);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível redefinir a senha.';
      Alert.alert('Erro', message);
    }
  };

  const handleResend = async () => {
    try {
      await forgotPassword(email);
      Alert.alert('Código reenviado', `Enviamos um novo código para ${email}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível reenviar o código.';
      Alert.alert('Erro', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </Pressable>

        <Text style={styles.title}>Digite o código</Text>
        <Text style={styles.subtitle}>Enviamos um código de 6 dígitos para {email}.</Text>

        <Text style={styles.label}>Código</Text>
        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />

        <Text style={styles.label}>Nova senha</Text>
        <PasswordInput
          placeholder="Mínimo 6 caracteres"
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <PrimaryButton
          title="Redefinir senha"
          onPress={handleSubmit}
          loading={isSubmitting}
          style={{ marginTop: 28 }}
        />

        <Pressable style={styles.resendLink} onPress={handleResend} disabled={isSubmitting}>
          <Text style={[styles.resendLinkText, { color: colors.primary }]}>Não recebeu? Reenviar código</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  backButton: { marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 8, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 6,
    color: '#111827',
  },
  resendLink: { marginTop: 20, alignItems: 'center' },
  resendLinkText: { fontSize: 13, fontWeight: '600' },
});
