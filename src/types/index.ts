export type UserRole = 'organizer' | 'buyer';
export type TicketStatus = 'pending_payment' | 'paid' | 'cancelled';
export type EventStatus = 'active' | 'cancelled' | 'deleted';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mercadoPagoConnected: boolean;
  isVerified: boolean;
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantityAvailable: number;
  quantitySold: number;
}

export interface Event {
  id: string;
  organizerId: string;
  organizerName: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  city: string;
  imageUrl: string;
  status: EventStatus;
  ticketTypes: TicketType[];
}

export interface PurchasedTicket {
  id: string;
  eventId: string;
  ticketTypeId: string | null;
  buyerId: string;
  eventTitle: string;
  ticketTypeName: string;
  quantity: number;
  totalPaid: number;
  purchasedAt: string;
  code: string;
  checkedInAt: string | null;
  status: TicketStatus;
  groupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupSeatIndex: number | null;
  attendeeName: string | null;
}
