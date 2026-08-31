export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type BuyerStackParamList = {
  Explore: undefined;
  EventDetail: { eventId: string };
};

export type BuyerTabParamList = {
  ExploreStack: undefined;
  MyTickets: undefined;
  Profile: undefined;
};

export type OrganizerStackParamList = {
  MyEvents: undefined;
  CreateEvent: { eventId?: string } | undefined;
  OrganizerEventDetail: { eventId: string };
  CheckInScanner: { eventId: string };
};

export type OrganizerTabParamList = {
  MyEventsStack: undefined;
  Profile: undefined;
};
