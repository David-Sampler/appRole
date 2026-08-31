import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput, ScrollView } from 'react-native';
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

  const toggleEditProfile = () => {
    if (!isEditingProfile) {
      setEditName(currentUser?.name ?? '');
      setEditEmail(currentUser?.email ?? '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setIsEditingProfile((v) => !v);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{currentUser?.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{currentUser?.name}</Text>
        <Text style={styles.email}>{currentUser?.email}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.primaryLight }]}>
          <Ionicons
            name={currentUser?.role === 'organizer' ? 'megaphone' : 'search'}
            size={13}
            color={colors.primary}
          />
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {currentUser?.role === 'organizer' ? 'Organizador' : 'Comprador'}
          </Text>
        </View>
      </View>

      <View style={styles.group}>
        <Pressable style={styles.row} onPress={toggleEditProfile}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="pencil-outline" size={16} color={colors.primary} />
          </View>
          <Text style={styles.rowLabel}>Editar perfil</Text>
          <Ionicons name={isEditingProfile ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
        </Pressable>

        {isEditingProfile && (
          <View style={styles.editPanel}>
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
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="card-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Recebimento</Text>
                {currentUser.mercadoPagoConnected ? (
                  <View style={styles.connectedRow}>
                    <Ionicons name="checkmark-circle" size={13} color="#059669" />
                    <Text style={styles.connectedText}>Mercado Pago conectado</Text>
                  </View>
                ) : (
                  <Text style={styles.rowSubtext}>Conecte sua conta pra receber pelos ingressos</Text>
                )}
              </View>
              {!currentUser.mercadoPagoConnected && (
                <Pressable
                  style={[styles.connectButton, { borderColor: colors.primary }]}
                  onPress={handleConnect}
                  disabled={isConnecting}
                >
                  <Text style={[styles.connectButtonText, { color: colors.primary }]}>
                    {isConnecting ? '...' : 'Conectar'}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>

      <Text style={styles.footerText}>Desenvolvido por David Sampler</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { alignItems: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 20 },
  header: { alignItems: 'center' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { fontSize: 19, fontWeight: '700', color: '#111827', marginTop: 14 },
  email: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
  },
  roleText: { fontWeight: '600', fontSize: 12 },
  group: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  rowSubtext: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 60 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  connectedText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  connectButton: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  connectButtonText: { fontSize: 12, fontWeight: '700' },
  editPanel: { paddingHorizontal: 16, paddingBottom: 18 },
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
    backgroundColor: '#F9FAFB',
  },
  editActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  editCancelButton: { paddingHorizontal: 14, paddingVertical: 12 },
  editCancelText: { color: '#6B7280', fontWeight: '600', fontSize: 13 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 14,
    borderRadius: 14,
  },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  footerText: { color: '#D1D5DB', fontSize: 11, marginTop: 20 },
});
