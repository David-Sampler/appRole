import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../api/client';
import GoogleButton from '../components/GoogleButton';
import PrimaryButton from '../components/PrimaryButton';
import PasswordInput from '../components/PasswordInput';
import { AuthStackParamList } from '../navigation/types';
import { useThemeStore } from '../store/useThemeStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((s) => s.login);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Ops', 'Preencha email e senha.');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível entrar.';
      Alert.alert('Erro ao entrar', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Image
            source={require('../../assets/brand/role-mark-white.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Rolê</Text>
          <Text style={styles.subtitle}>Compre e venda ingressos para os melhores eventos</Text>
        </View>

        <View style={styles.form}>
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
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={styles.forgotPasswordLink} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Esqueci minha senha</Text>
          </Pressable>

          <PrimaryButton
            title="Entrar"
            onPress={handleLogin}
            loading={isSubmitting}
            style={{ marginTop: 28 }}
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.divider} />
          </View>

          <GoogleButton
            onError={(message) => Alert.alert('Erro ao entrar com Google', message)}
          />

          <Pressable style={styles.registerLink} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLinkText}>
              Não tem conta?{' '}
              <Text style={[styles.registerLinkBold, { color: colors.primary }]}>Cadastre-se</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hero: {
    paddingTop: 90,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logo: { width: 64, height: 64 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 12 },
  subtitle: {
    fontSize: 14,
    color: '#EDE9FE',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  form: { flex: 1, padding: 24 },
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
  forgotPasswordLink: { alignSelf: 'flex-end', marginTop: 10 },
  forgotPasswordText: { fontSize: 13, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  divider: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 12, color: '#9CA3AF' },
  registerLink: { marginTop: 24, alignItems: 'center' },
  registerLinkText: { fontSize: 14, color: '#6B7280' },
  registerLinkBold: { fontWeight: '700' },
});
