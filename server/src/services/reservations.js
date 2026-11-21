// Operações de reserva/estoque que precisam ser seguras sob concorrência.
//
// Regras:
// - O estoque (ticketTypes.quantitySold) só muda com $inc atômico ou dentro de transação.
//   Nunca regravar o valor lido (isso perdia atualizações de compras simultâneas).
// - Cada reserva tem um "líder": o ingresso cujo _id é o reservationId (mesa) ou o próprio
//   ingresso (compra avulsa). Quem consegue mudar o status do líder primeiro (pagamento,
//   expiração, cancelamento) é o único que processa a reserva — evita processar em dobro.
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import Group from '../models/Group.js';

export const leaderIdOf = (ticket) => ticket.reservationId ?? ticket._id;

export function incSold(eventId, ticketTypeId, delta, session) {
  return Event.updateOne(
    { _id: eventId, 'ticketTypes._id': ticketTypeId },
    { $inc: { 'ticketTypes.$.quantitySold': delta } },
    session ? { session } : {}
  );
}

// Cancela uma reserva pendente e devolve estoque/mesa. Retorna true se esta chamada cancelou.
export async function releaseReservation(ticketId, reason = 'checkout_failed') {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return false;
  const leaderId = leaderIdOf(ticket);

  // trava: só segue quem tirar o líder de "pending_payment"
  const leader = await Ticket.findOneAndUpdate(
    { _id: leaderId, status: 'pending_payment' },
    { $set: { status: 'cancelled', cancelReason: reason } },
    { new: true }
  );
  if (!leader) return false;

  if (ticket.reservationId) {
    await Ticket.updateMany(
      { reservationId: leaderId, _id: { $ne: leaderId }, status: 'pending_payment' },
      { $set: { status: 'cancelled', cancelReason: reason } }
    );
    if (leader.groupId) {
      const group = await Group.findById(leader.groupId, { size: 1 });
      if (group) {
        await Group.updateOne({ _id: group._id, status: 'sold' }, { $set: { status: 'available', seatsLeft: group.size } });
      }
    }
    return true;
  }

  if (leader.ticketTypeId) await incSold(leader.event, leader.ticketTypeId, -leader.quantity);
  return true;
}

// Marca a reserva como paga. Retorna os ingressos pagos se esta chamada venceu a trava, senão null.
export async function markReservationPaid(anyTicket, paymentId) {
  const leaderId = leaderIdOf(anyTicket);
  const leader = await Ticket.findOneAndUpdate(
    { _id: leaderId, status: 'pending_payment' },
    { $set: { status: 'paid', paymentId: paymentId ?? undefined } },
    { new: true }
  );
  if (!leader) return null;
  if (anyTicket.reservationId) {
    await Ticket.updateMany(
      { reservationId: leaderId, _id: { $ne: leaderId } },
      { $set: { status: 'paid', ...(paymentId ? { paymentId } : {}) }, $unset: { cancelReason: '' } }
    );
    return Ticket.find({ reservationId: leaderId }).sort({ groupSeatIndex: 1 });
  }
  return [leader];
}

// Pagamento aprovado depois que a reserva venceu/foi substituída: tenta reservar de novo.
// Retorna 'reclaimed' (pago), 'unavailable' (precisa reembolsar) ou 'busy' (outra chamada já cuida).
export async function reclaimReservation(anyTicket, reclaimableReasons, paymentId) {
  const leaderId = leaderIdOf(anyTicket);
  const leader = await Ticket.findOneAndUpdate(
    { _id: leaderId, status: 'cancelled', cancelReason: { $in: reclaimableReasons } },
    { $set: { cancelReason: 'reclaiming' } },
    { new: true }
  );
  if (!leader) return { result: 'busy' };
  const originalReason = anyTicket.cancelReason ?? 'expired';

  const event = await Event.findById(leader.event);
  let ok = false;
  if (event && event.status === 'active') {
    if (leader.groupId) {
      const size = await Ticket.countDocuments({ reservationId: leaderId });
      const group = await Group.findOneAndUpdate(
        { _id: leader.groupId, status: 'available', size },
        { $set: { status: 'sold', seatsLeft: 0 } },
        { new: true }
      );
      ok = Boolean(group);
    } else {
      // transação: confere o que sobrou e incrementa sem perder compras simultâneas
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          ok = false;
          const ev = await Event.findById(leader.event).session(session);
          const tt = ev?.ticketTypes.id(leader.ticketTypeId);
          if (!tt || tt.quantityAvailable - tt.quantitySold < leader.quantity) return;
          await incSold(ev._id, tt._id, leader.quantity, session);
          ok = true;
        });
      } finally {
        await session.endSession();
      }
    }
  }

  if (!ok) return { result: 'unavailable', leaderId, originalReason };

  // volta a "pendente" já com o paymentId: a expiração ignora reservas com pagamento em curso
  await Ticket.updateMany(
    { $or: [{ _id: leaderId }, { reservationId: leaderId }] },
    { $set: { status: 'pending_payment', paymentId }, $unset: { cancelReason: '' } }
  );
  return { result: 'reclaimed', leaderId };
}
