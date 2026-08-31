import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';
import { getMercadoPagoConnectUrl } from '../api/payments';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { useThemeStore } from '../store/useThemeStore';

export default function ProfileScreen() {
  const colors = useThemeStore((s) => s.colors);
  const themeName = useThemeStore((s) => s.themeName);
  const setTheme = useThemeStore((s) => s.setTheme);
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [isConnecting, setIsConnecting] = useState(false);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const openEditProfile = () => {
    setEditName(currentUser?.name ?? '');
    setEditEmail(currentUser?.email ?? '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editEmail.trim()) {
      Alert.alert('Campos obrigatórios', 'Preencha nome e email.');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      Alert.alert('Senhas diferentes', 'A nova senha e a confirmação não coincidem.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      Alert.alert('Senha inválida', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateProfile({
        name: editName.trim(),
        email: editEmail.trim(),
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      setIsEditingProfile(false);
      Alert.alert('Perfil atualizado', 'Suas informações foram salvas.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.';
      Alert.alert('Erro', message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { url } = await getMercadoPagoConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await refreshUser();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível iniciar a conexão.';
      Alert.alert('Erro', message);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarText}>{currentUser?.name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{currentUser?.name}</Text>
      <Text style={styles.email}>{currentUser?.email}</Text>
      <View style={[styles.roleBadge, { backgroundColor: colors.primaryLight }]}>
        <Ionicons
          name={currentUser?.role === 'organizer' ? 'megaphone' : 'search'}
          size={14}
          color={colors.primary}
        />
        <Text style={[styles.roleText, { color: colors.primary }]}>
          {currentUser?.role === 'organizer' ? 'Organizador' : 'Comprador'}
        </Text>
      </View>

      {!isEditingProfile ? (
        <Pressable style={[styles.editProfileButton, { borderColor: colors.primary }]} onPress={openEditProfile}>
          <Ionicons name="pencil-outline" size={16} color={colors.primary} />
          <Text style={[styles.editProfileButtonText, { color: colors.primary }]}>Editar perfil</Text>
        </Pressable>
      ) : (
        <View style={styles.editCard}>
          <Text style={styles.editCardTitle}>Editar perfil</Text>

          <Text style={styles.editLabel}>Nome</Text>
          <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} placeholderTextColor="#9CA3AF" />

          <Text style={styles.editLabel}>Email</Text>
          <TextInput
            style={styles.editInput}
            value={editEmail}
            onChangeText={setEditEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.editSectionTitle}>Alterar senha (opcional)</Text>
          <Text style={styles.editLabel}>Senha atual</Text>
          <TextInput
            style={styles.editInput}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.editLabel}>Nova senha</Text>
          <TextInput
            style={styles.editInput}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.editLabel}>Confirmar nova senha</Text>
          <TextInput
            style={styles.editInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.editActionsRow}>
            <Pressable
              style={styles.editCancelButton}
              onPress={() => setIsEditingProfile(false)}
              disabled={isSavingProfile}
            >
              <Text style={styles.editCancelText}>Cancelar</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Salvar" onPress={handleSaveProfile} loading={isSavingProfile} />
            </View>
          </View>
        </View>
      )}

      {currentUser?.role === 'organizer' && (
        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Recebimento</Text>
          {currentUser.mercadoPagoConnected ? (
            <View style={styles.connectedRow}>
              <Ionicons name="checkmark-circle" size={18} color="#059669" />
              <Text style={styles.connectedText}>Mercado Pago conectado</Text>
            </View>
          ) : (
            <>
              <Text style={styles.paymentDesc}>
                Conecte sua conta do Mercado Pago para receber diretamente pelos ingressos vendidos.
              </Text>
              <PrimaryButton
                title="Conectar Mercado Pago"
                onPress={handleConnect}
                loading={isConnecting}
              />
            </>
          )}
        </View>
      )}

      <View style={styles.themeCard}>
        <Text style={styles.themeTitle}>Tema</Text>
        <View style={styles.themeRow}>
          <Pressable
            style={[
              styles.themeOption,
              themeName === 'purple' && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
            ]}
            onPress={() => setTheme('purple')}
          >
            <View style={[styles.themeSwatch, { backgroundColor: '#7C3AED' }]} />
            <Text style={styles.themeOptionText}>Roxo</Text>
          </Pressable>
          <Pressable
            style={[
              styles.themeOption,
              themeName === 'gray' && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
            ]}
            onPress={() => setTheme('gray')}
          >
            <View style={[styles.themeSwatch, { backgroundColor: '#282B30' }]} />
            <Text style={styles.themeOptionText}>Cinza</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 60, backgroundColor: '#fff' },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 16 },
  email: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  roleText: { fontWeight: '600', fontSize: 13 },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 16,
  },
  editProfileButtonText: { fontWeight: '700', fontSize: 13 },
  editCard: {
    width: '85%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
  editCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
  editSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginTop: 18, marginBottom: 2 },
  editLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 10, marginBottom: 4 },
  editInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  editActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  editCancelButton: { paddingHorizontal: 14, paddingVertical: 12 },
  editCancelText: { color: '#6B7280', fontWeight: '600', fontSize: 13 },
  paymentCard: {
    width: '85%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginTop: 28,
  },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 },
  paymentDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 14 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectedText: { fontSize: 14, fontWeight: '600', color: '#059669' },
  themeCard: {
    width: '85%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
  themeTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  themeRow: { flexDirection: 'row', gap: 12 },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  themeSwatch: { width: 20, height: 20, borderRadius: 10 },
  themeOptionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
});
