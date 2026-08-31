import { request } from './client';
import { User, UserRole } from '../types';

interface AuthResponse {
  token: string;
  user: User;
}

export function register(name: string, email: string, password: string, role: UserRole) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { name, email, password, role },
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function googleAuth(idToken: string, role?: UserRole) {
  return request<AuthResponse>('/auth/google', {
    method: 'POST',
    body: { idToken, role },
  });
}

export function me() {
  return request<{ user: User }>('/auth/me');
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export function updateProfile(input: UpdateProfileInput) {
  return request<{ user: User }>('/auth/me', { method: 'PATCH', body: input });
}

export function verifyEmail(code: string) {
  return request<{ user: User }>('/auth/verify-email', { method: 'POST', body: { code } });
}

export function resendVerification() {
  return request<{ message: string }>('/auth/resend-verification', { method: 'POST' });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return request<{ token: string; user: User }>('/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
  });
}
