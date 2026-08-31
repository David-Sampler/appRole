import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGoogleSignIn } from '../auth/useGoogleSignIn';
import { UserRole } from '../types';

interface Props {
  pendingRole?: UserRole;
  onError: (message: string) => void;
}

export default function GoogleButton({ pendingRole, onError }: Props) {
  const { promptGoogleSignIn, isLoading, isReady } = useGoogleSignIn({ pendingRole, onError });

  return (
    <Pressable
      style={[styles.button, !isReady && styles.buttonDisabled]}
      onPress={promptGoogleSignIn}
      disabled={!isReady || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator color="#374151" />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color="#374151" />
          <Text style={styles.text}>Continuar com Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  buttonDisabled: { opacity: 0.5 },
  text: { fontSize: 15, fontWeight: '600', color: '#374151' },
});
