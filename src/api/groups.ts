import { request } from './client';
import { PurchasedTicket } from '../types';

export interface EventGroup {
  id: string;
  eventId: string;
  name: string;
  size: number;
  seatsLeft: number;
  price: number;
  code: string;
  status: 'available' | 'sold';
}

export function listGroups(eventId: string) {
  return request<{ groups: EventGroup[] }>(`/groups/event/${eventId}`);
}

export function createGroup(eventId: string, input: { name: string; size: number; price: number }) {
  return request<{ group: EventGroup }>(`/groups/event/${eventId}`, { method: 'POST', body: input });
}

export interface GroupAttendee {
  name: string;
  email?: string;
}

export function purchaseGroup(groupId: string, attendees: GroupAttendee[]) {
  return request<{ ticket: PurchasedTicket; checkoutUrl: string }>(`/groups/${groupId}/purchase`, {
    method: 'POST',
    body: { attendees },
  });
}

export function checkInGroup(code: string) {
  return request<{ message: string }>(`/groups/${code}/checkin`, { method: 'POST' });
}
