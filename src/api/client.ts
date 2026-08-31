import { File, UploadType } from 'expo-file-system';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message ?? 'Erro inesperado no servidor.', res.status, data);
  }

  return data as T;
}

export async function uploadFile<T>(path: string, fieldName: string, uri: string): Promise<T> {
  const file = new File(uri);
  const result = await file.upload(`${API_BASE_URL}${path}`, {
    uploadType: UploadType.MULTIPART,
    fieldName,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  let data: any = {};
  try {
    data = JSON.parse(result.body);
  } catch {
    // resposta sem corpo JSON válido
  }

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(data.message ?? 'Erro inesperado no servidor.', result.status, data);
  }

  return data as T;
}
