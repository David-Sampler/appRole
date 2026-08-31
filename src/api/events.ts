import { request } from './client';
import { Event } from '../types';

export function listEvents(params?: { search?: string; category?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  const qs = query.toString();
  return request<{ events: Event[] }>(`/events${qs ? `?${qs}` : ''}`);
}

export function getEvent(id: string) {
  return request<{ event: Event }>(`/events/${id}`);
}

export function myEvents() {
  return request<{ events: Event[] }>('/events/mine');
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  imageUrl?: string;
  ticketTypes: { name: string; price: number; quantityAvailable: number }[];
}

export function createEvent(input: CreateEventInput) {
  return request<{ event: Event }>('/events', { method: 'POST', body: input });
}

export function purchaseTicket(eventId: string, ticketTypeId: string, quantity: number) {
  return request<{ ticket: import('../types').PurchasedTicket; checkoutUrl: string }>(
    `/events/${eventId}/purchase`,
    { method: 'POST', body: { ticketTypeId, quantity } }
  );
}

export interface EventBuyer {
  id: string;
  buyerName: string;
  buyerEmail: string;
  ticketTypeName: string;
  quantity: number;
  totalPaid: number;
  code: string;
  purchasedAt: string;
  checkedInAt: string | null;
  status: 'pending_payment' | 'paid' | 'cancelled';
}

export function eventBuyers(eventId: string) {
  return request<{ tickets: EventBuyer[] }>(`/events/${eventId}/buyers`);
}
