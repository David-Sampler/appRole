import { request } from './client';
import { PurchasedTicket } from '../types';

export function myTickets() {
  return request<{ tickets: PurchasedTicket[] }>('/tickets/mine');
}

export interface CheckInResult {
  message: string;
  ticket: {
    buyerName: string;
    ticketTypeName: string;
    quantity: number;
    checkedInAt: string;
  };
}

export function checkInTicket(code: string) {
  return request<CheckInResult>('/tickets/checkin', {
    method: 'POST',
    body: { code },
  });
}
