export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type BuyerStackParamList = {
  Explore: undefined;
  EventDetail: { eventId: string };
  PurchaseGroup: { groupId: string; groupName: string; size: number; price: number };
  Help: undefined;
};

export type BuyerTabParamList = {
  ExploreStack: undefined;
  MyTickets: undefined;
  Profile: undefined;
};

export type OrganizerStackParamList = {
  MyEvents: undefined;
  DeletedEvents: undefined;
  CreateEvent: { eventId?: string } | undefined;
  OrganizerEventDetail: { eventId: string };
  CheckInScanner: { eventId: string };
  Groups: { eventId: string };
  CreateGroup: { eventId: string; group?: { id: string; name: string; size: number; price: number } };
  Help: undefined;
};

export type OrganizerTabParamList = {
  MyEventsStack: undefined;
  Profile: undefined;
};
