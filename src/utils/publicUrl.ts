const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const WEB_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export function eventCheckoutUrl(eventId: string) {
  return `${WEB_BASE_URL}/e/${eventId}`;
}

export function ticketViewUrl(code: string) {
  return `${WEB_BASE_URL}/t/${code}`;
}
