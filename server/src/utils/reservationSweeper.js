import Ticket from '../models/Ticket.js';
import { releaseReservation } from '../controllers/event.controller.js';
import { RESERVATION_TTL_MS, RESERVATION_SWEEP_INTERVAL_MS } from '../config/reservation.js';

// Libera reservas que ficaram em "aguardando pagamento" além do prazo, quando o comprador
// abandonou o checkout. Reservas com paymentId (ex: Pix/boleto pendente) ficam de fora:
// o Mercado Pago ainda vai avisar se o pagamento foi aprovado ou cancelado.
export async function expireStaleReservations(now = new Date()) {
  const cutoff = new Date(now.getTime() - RESERVATION_TTL_MS);
  const stale = await Ticket.find(
    { status: 'pending_payment', createdAt: { $lt: cutoff }, paymentId: { $exists: false } },
    { _id: 1, reservationId: 1 }
  );

  // uma mesa tem vários ingressos na mesma reserva: libera cada reserva uma vez só
  const seen = new Set();
  let released = 0;
  for (const t of stale) {
    const key = String(t.reservationId ?? t._id);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await releaseReservation(t._id, 'expired');
      released++;
    } catch (err) {
      console.error(`Falha ao expirar reserva ${key}:`, err.message);
    }
  }
  if (released > 0) console.log(`Reservas expiradas liberadas: ${released}`);
  return released;
}

export function startReservationSweeper() {
  const run = () => expireStaleReservations().catch((err) => console.error('Erro ao expirar reservas:', err.message));
  run();
  return setInterval(run, RESERVATION_SWEEP_INTERVAL_MS);
}
