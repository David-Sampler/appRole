import Ticket from '../models/Ticket.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { toPublicTicket } from '../utils/serialize.js';
import { refundPayment } from '../utils/mercadopago.js';
import { decryptSecret, isNonEmptyString, isValidEmail } from '../utils/security.js';
import { incSold } from '../services/reservations.js';

// Tentativas de compra que nunca foram pagas não aparecem em "Meus ingressos"
// (inclusive reservas que outra pessoa criou usando o email do usuário).
const NEVER_PAID_REASONS = ['expired', 'checkout_failed', 'replaced', 'payment_rejected', 'event_cancelled'];

export async function myTickets(req, res) {
  const tickets = await Ticket.find({
    buyer: req.user._id,
    $nor: [{ status: 'cancelled', cancelReason: { $in: NEVER_PAID_REASONS } }],
  }).sort({ createdAt: -1 });
  res.json({ tickets: tickets.map(toPublicTicket) });
}

export async function cancelTicket(req, res) {
  const ticket = await Ticket.findById(req.params.id).catch(() => null);
  if (!ticket) return res.status(404).json({ message: 'Ingresso não encontrado.' });
  if (ticket.buyer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Este ingresso não pertence a você.' });
  }
  if (ticket.status !== 'paid') {
    return res.status(409).json({ message: 'Apenas ingressos pagos podem ser cancelados.' });
  }
  if (ticket.checkedInAt) {
    return res.status(409).json({ message: 'Este ingresso já foi validado na entrada e não pode ser cancelado.' });
  }
  if (ticket.groupId) {
    return res.status(409).json({
      message: 'Ingressos de mesa não podem ser cancelados individualmente. Entre em contato com o organizador.',
    });
  }

  const event = await Event.findById(ticket.event);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

  // trava o ingresso antes do reembolso: dois pedidos simultâneos não devolvem estoque/dinheiro em dobro
  const locked = await Ticket.findOneAndUpdate(
    { _id: ticket._id, status: 'paid', checkedInAt: null },
    { $set: { status: 'cancelled', cancelReason: 'buyer_cancelled' } },
    { new: true }
  );
  if (!locked) {
    return res.status(409).json({ message: 'Este ingresso já foi cancelado ou validado.' });
  }

  if (ticket.paymentId) {
    const organizer = await User.findById(event.organizer);
    try {
      await refundPayment(ticket.paymentId, decryptSecret(organizer?.mpAccessToken));
    } catch (err) {
      await Ticket.updateOne({ _id: ticket._id }, { $set: { status: 'paid' }, $unset: { cancelReason: '' } });
      return res.status(502).json({ message: 'Não foi possível processar o reembolso. Tente novamente mais tarde.' });
    }
  }

  // $inc atômico: não sobrescreve compras que acontecem ao mesmo tempo
  if (ticket.ticketTypeId) await incSold(event._id, ticket.ticketTypeId, -ticket.quantity);

  res.json({ ticket: toPublicTicket(locked) });
}

// Rota pública: só o necessário para mostrar o ingresso, sem dados pessoais (email, ids de usuário).
export async function getTicketByCode(req, res) {
  const ticket = await Ticket.findOne({ code: String(req.params.code).trim().toUpperCase() });
  if (!ticket) return res.status(404).json({ message: 'Ingresso não encontrado.' });

  const event = await Event.findById(ticket.event);
  res.json({
    ticket: {
      code: ticket.code,
      status: ticket.status,
      eventTitle: ticket.eventTitle,
      ticketTypeName: ticket.ticketTypeName,
      quantity: ticket.quantity,
      groupName: ticket.groupName ?? null,
      attendeeName: ticket.attendeeName ?? null,
      checkedInAt: ticket.checkedInAt ?? null,
    },
    event: event
      ? { id: event._id.toString(), title: event.title, date: event.date, time: event.time, location: event.location }
      : null,
  });
}

export async function checkInTicket(req, res) {
  const { code } = req.body;
  if (!isNonEmptyString(code)) return res.status(400).json({ message: 'Código ausente.' });

  const ticket = await Ticket.findOne({ code: code.trim().toUpperCase() }).populate('buyer', 'name email');
  if (!ticket) {
    return res.status(404).json({ message: 'Ingresso não encontrado.' });
  }

  const event = await Event.findById(ticket.event);
  if (!event || event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Este ingresso não pertence a um evento seu.' });
  }
  if (event.status !== 'active') {
    return res.status(409).json({ message: 'Este evento foi cancelado. A entrada não pode ser validada.' });
  }

  if (ticket.status !== 'paid') {
    return res.status(409).json({
      message:
        ticket.status === 'pending_payment' ? 'Este ingresso ainda não foi pago.' : 'Este ingresso foi cancelado.',
    });
  }

  const summary = (checkedInAt) => ({
    buyerName: ticket.attendeeName ?? ticket.buyer?.name ?? 'Comprador removido',
    ticketTypeName: ticket.ticketTypeName,
    quantity: ticket.quantity,
    checkedInAt,
  });

  // atômico: se duas portarias lerem o mesmo QR ao mesmo tempo, só uma valida
  const updated = await Ticket.findOneAndUpdate(
    { _id: ticket._id, status: 'paid', checkedInAt: null },
    { $set: { checkedInAt: new Date() } },
    { new: true }
  );
  if (!updated) {
    const current = await Ticket.findById(ticket._id);
    return res.status(409).json({ message: 'Este ingresso já foi validado.', ticket: summary(current?.checkedInAt) });
  }

  res.json({ message: 'Ingresso validado com sucesso!', ticket: summary(updated.checkedInAt) });
}

// Participante de mesa cadastrado sem email informa o próprio nome/email no ingresso.
export async function claimTicket(req, res) {
  const code = String(req.params.code ?? '').trim().toUpperCase();
  const { name, email } = req.body;
  if (!code) return res.status(400).json({ message: 'Código ausente.' });
  if (!isNonEmptyString(name) || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Nome e email válidos são obrigatórios para reivindicar.' });
  }

  const ticket = await Ticket.findOne({ code });
  if (!ticket || !ticket.groupId || ticket.status !== 'paid') {
    return res.status(404).json({ message: 'Ingresso não encontrado.' });
  }

  const claimed = await Ticket.findOneAndUpdate(
    { _id: ticket._id, attendeeEmail: null },
    { $set: { attendeeName: name.trim().slice(0, 120), attendeeEmail: email.trim().toLowerCase() } },
    { new: true }
  );
  if (!claimed) {
    return res.status(409).json({ message: 'Este ingresso já foi reivindicado.' });
  }

  res.json({ ticket: { code: claimed.code, attendeeName: claimed.attendeeName, status: claimed.status } });
}
