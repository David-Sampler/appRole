import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../api/client';
import { UserRole } from '../types';

WebBrowser.maybeCompleteAuthSession();

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

interface Options {
  pendingRole?: UserRole;
  onError: (message: string) => void;
}

export function useGoogleSignIn({ pendingRole, onError }: Options) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const isConfigured = Boolean(webClientId);

  // expo-auth-session throws synchronously during render if no client id is
  // provided for the current platform, so a placeholder is passed when Google
  // sign-in hasn't been configured yet — promptGoogleSignIn() blocks on isConfigured
  // before ever using it.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId ?? 'not-configured',
    iosClientId: iosClientId ?? webClientId ?? 'not-configured',
    androidClientId: androidClientId ?? webClientId ?? 'not-configured',
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken) {
      loginWithGoogle(response.authentication.idToken, pendingRole).catch((err) => {
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível entrar com o Google.';
        onError(message);
      });
    } else if (response?.type === 'error') {
      onError('Não foi possível entrar com o Google.');
    }
  }, [response]);

  return {
    isReady: isConfigured && Boolean(request),
    isLoading: isSubmitting,
    promptGoogleSignIn: () => {
      if (!isConfigured) {
        onError('Login com Google ainda não foi configurado neste app.');
        return;
      }
      promptAsync();
    },
  };
}
