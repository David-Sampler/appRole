import { request } from './client';

export function getMercadoPagoConnectUrl() {
  return request<{ url: string }>('/payments/mp/connect');
}
