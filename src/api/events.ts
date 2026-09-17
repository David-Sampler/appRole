import { request } from './client';
import { Event } from '../types';

export function listEvents(params?: { search?: string; category?: string; city?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  if (params?.city) query.set('city', params.city);
  const qs = query.toString();
  return request<{ events: Event[] }>(`/events${qs ? `?${qs}` : ''}`);
}

export function listCities() {
  return request<{ cities: string[] }>('/events/cities');
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
  city: string;
  imageUrl?: string;
  ticketTypes: { name: string; price: number; quantityAvailable: number }[];
}

export function createEvent(input: CreateEventInput) {
  return request<{ event: Event }>('/events', { method: 'POST', body: input });
}

export interface UpdateEventInput {
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  city: string;
  imageUrl?: string;
  ticketTypes: { id?: string; name: string; price: number; quantityAvailable: number }[];
}

export function updateEvent(eventId: string, input: UpdateEventInput) {
  return request<{ event: Event }>(`/events/${eventId}`, { method: 'PUT', body: input });
}

export function cancelEvent(eventId: string) {
  return request<{ event: Event }>(`/events/${eventId}/cancel`, { method: 'PATCH' });
}

export function deleteEvent(eventId: string) {
  return request<{ event: Event }>(`/events/${eventId}`, { method: 'DELETE' });
}

export function restoreEvent(eventId: string) {
  return request<{ event: Event }>(`/events/${eventId}/restore`, { method: 'PATCH' });
}

export function listDeletedEvents() {
  return request<{ events: Event[] }>('/events/deleted');
}

export function purgeEvent(eventId: string) {
  return request<void>(`/events/${eventId}/purge`, { method: 'DELETE' });
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
