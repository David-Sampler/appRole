import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, UserRole } from '../types';
import { setAuthToken } from '../api/client';
import * as authApi from '../api/auth';

const TOKEN_KEY = 'role_token';

interface AuthState {
  user: User | null;
  isRestoring: boolean;
  isSubmitting: boolean;

  restoreSession: () => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string, role?: UserRole) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (input: authApi.UpdateProfileInput) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  logout: () => Promise<void>;
}

async function persistSession(token: string, user: User, set: (partial: Partial<AuthState>) => void) {
  setAuthToken(token);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  set({ user });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isRestoring: true,
  isSubmitting: false,

  restoreSession: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) {
      set({ isRestoring: false });
      return;
    }
    setAuthToken(token);
    try {
      const { user } = await authApi.me();
      set({ user, isRestoring: false });
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setAuthToken(null);
      set({ user: null, isRestoring: false });
    }
  },

  register: async (name, email, password, role) => {
    set({ isSubmitting: true });
    try {
      const { token, user } = await authApi.register(name, email, password, role);
      await persistSession(token, user, set);
    } finally {
      set({ isSubmitting: false });
    }
  },

  login: async (email, password) => {
    set({ isSubmitting: true });
    try {
      const { token, user } = await authApi.login(email, password);
      await persistSession(token, user, set);
    } finally {
      set({ isSubmitting: false });
    }
  },

  loginWithGoogle: async (idToken, role) => {
    set({ isSubmitting: true });
    try {
      const { token, user } = await authApi.googleAuth(idToken, role);
      await persistSession(token, user, set);
    } finally {
      set({ isSubmitting: false });
    }
  },

  forgotPassword: async (email) => {
    set({ isSubmitting: true });
    try {
      await authApi.forgotPassword(email);
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetPassword: async (email, code, newPassword) => {
    set({ isSubmitting: true });
    try {
      const { token, user } = await authApi.resetPassword(email, code, newPassword);
      await persistSession(token, user, set);
    } finally {
      set({ isSubmitting: false });
    }
  },

  refreshUser: async () => {
    try {
      const { user } = await authApi.me();
      set({ user });
    } catch {
      // ignora falha silenciosa de refresh
    }
  },

  updateProfile: async (input) => {
    set({ isSubmitting: true });
    try {
      const { user } = await authApi.updateProfile(input);
      set({ user });
    } finally {
      set({ isSubmitting: false });
    }
  },

  verifyEmail: async (code) => {
    set({ isSubmitting: true });
    try {
      const { user } = await authApi.verifyEmail(code);
      set({ user });
    } finally {
      set({ isSubmitting: false });
    }
  },

  resendVerification: async () => {
    await authApi.resendVerification();
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    set({ user: null });
  },
}));
