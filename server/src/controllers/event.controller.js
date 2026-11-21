import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { toPublicEvent, toPublicTicket } from '../utils/serialize.js';
import { createPaymentPreference, isPaymentsConfigured } from '../utils/mercadopago.js';
import { RESERVATION_TTL_MS } from '../config/reservation.js';
import { randomCode, decryptSecret, isNonEmptyString, isValidEmail } from '../utils/security.js';
import { releaseReservation, markReservationPaid } from '../services/reservations.js';
import { sendPurchaseConfirmations } from '../services/confirmations.js';

export { releaseReservation };

// Texto digitado pelo usuário vira busca literal (ex: "Recife(" não quebra a regex).
// Caracteres de controle (ex.: \0) são removidos: o Mongo recusa regex com byte nulo.
const escapeRegex = (text) =>
  String(text)
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Formato usado pelo app: data AAAA-MM-DD (válida no calendário) e hora HH:MM.
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const isValidTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function validateEventFields(body, current) {
  const { title, description, category, date, time, location, city, ticketTypes } = body;
  const texts = [title, description, category, location, city];
  if (!texts.every(isNonEmptyString) || !date || !time) {
    return 'Preencha todos os campos do evento, incluindo a cidade.';
  }
  // na edição, aceita a data/hora que já estava salva (eventos antigos em outro formato)
  if (!isValidDate(date) && date !== current?.date) return 'Data inválida. Use o formato AAAA-MM-DD.';
  if (!isValidTime(time) && time !== current?.time) return 'Horário inválido. Use o formato HH:MM.';
  if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) return 'Adicione pelo menos um tipo de ingresso.';
  for (const tt of ticketTypes) {
    if (!tt || !isNonEmptyString(tt.name) || typeof tt.price !== 'number' || !Number.isFinite(tt.price) || tt.price < 0) {
      return 'Tipo de ingresso inválido.';
    }
    if (!Number.isInteger(tt.quantityAvailable) || tt.quantityAvailable <= 0) return 'Quantidade de ingresso inválida.';
  }
  return null;
}

export async function listEvents(req, res) {
  const { search, category, city } = req.query;
  const filter = { status: 'active' };
  if (category) filter.category = String(category);
  if (city) filter.city = { $regex: `^${escapeRegex(city)}$`, $options: 'i' };
  if (search) {
    const pattern = escapeRegex(search);
    filter.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { location: { $regex: pattern, $options: 'i' } },
      { city: { $regex: pattern, $options: 'i' } },
    ];
  }
  const events = await Event.find(filter).sort({ createdAt: -1 });
  res.json({ events: events.map(toPublicEvent) });
}

export async function listCities(req, res) {
  const cities = await Event.distinct('city', { status: 'active', city: { $nin: [null, ''] } });
  res.json({ cities: cities.sort((a, b) => a.localeCompare(b, 'pt-BR')) });
}

export async function getEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.status === 'deleted') return res.status(404).json({ message: 'Evento não encontrado.' });
  res.json({ event: toPublicEvent(event) });
}

export async function myEvents(req, res) {
  const events = await Event.find({ organizer: req.user._id, status: { $ne: 'deleted' } }).sort({ createdAt: -1 });
  res.json({ events: events.map(toPublicEvent) });
}

export async function eventBuyers(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.status === 'deleted') return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }

  const tickets = await Ticket.find({ event: event._id })
    .populate('buyer', 'name email')
    .sort({ createdAt: -1 });

  res.json({
    tickets: tickets.map((t) => ({
      id: t._id.toString(),
      buyerName: t.buyer?.name ?? 'Comprador removido',
      buyerEmail: t.buyer?.email ?? '',
      ticketTypeName: t.ticketTypeName,
      quantity: t.quantity,
      totalPaid: t.totalPaid,
      code: t.code,
      purchasedAt: t.createdAt,
      checkedInAt: t.checkedInAt ?? null,
      status: t.status,
      groupName: t.groupName ?? null,
      attendeeName: t.attendeeName ?? null,
    })),
  });
}

export async function createEvent(req, res) {
  if (!req.user.isVerified) {
    return res.status(403).json({
      message: 'Confirme seu email de organizador antes de publicar um evento.',
    });
  }

  const { title, description, category, date, time, location, city, imageUrl, ticketTypes } = req.body;

  const invalid = validateEventFields(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== 'string') {
    return res.status(400).json({ message: 'Imagem inválida.' });
  }

  const event = await Event.create({
    organizer: req.user._id,
    organizerName: req.user.name,
    title,
    description,
    category,
    date,
    time,
    location,
    city,
    imageUrl: imageUrl || `https://picsum.photos/seed/${Date.now()}/800/500`,
    ticketTypes: ticketTypes.map((tt) => ({
      name: tt.name,
      price: tt.price,
      quantityAvailable: tt.quantityAvailable,
      quantitySold: 0,
    })),
  });

  res.status(201).json({ event: toPublicEvent(event) });
}

export async function updateEvent(req, res) {
  const current = await Event.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (current.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (current.status === 'cancelled') {
    return res.status(409).json({ message: 'Este evento foi cancelado e não pode ser editado.' });
  }

  const { title, description, category, date, time, location, city, imageUrl, ticketTypes } = req.body;
  const invalid = validateEventFields(req.body, current);
  if (invalid) return res.status(400).json({ message: invalid });

  // Transação: o estoque vendido é relido aqui dentro, então uma compra que acontece
  // durante a edição não é apagada (antes a edição regravava quantitySold com valor velho).
  const session = await mongoose.startSession();
  let saved;
  try {
    await session.withTransaction(async () => {
      const event = await Event.findById(current._id).session(session);
      const existingTypesById = new Map(event.ticketTypes.map((tt) => [tt._id.toString(), tt]));
      const keptIds = new Set();
      const nextTicketTypes = [];
      for (const tt of ticketTypes) {
        const existing = typeof tt.id === 'string' ? existingTypesById.get(tt.id) : null;
        const quantitySold = existing?.quantitySold ?? 0;
        if (tt.quantityAvailable < quantitySold) {
          throw Object.assign(new Error(`A quantidade de "${tt.name}" não pode ser menor que ${quantitySold} (já vendidos).`), { status: 400 });
        }
        if (existing) keptIds.add(existing._id.toString());
        nextTicketTypes.push(
          existing
            ? { _id: existing._id, name: tt.name, price: tt.price, quantityAvailable: tt.quantityAvailable, quantitySold }
            : { name: tt.name, price: tt.price, quantityAvailable: tt.quantityAvailable, quantitySold: 0 }
        );
      }
      // não deixa sumir um tipo que já tem ingressos vendidos ou reservados
      const removedWithSales = event.ticketTypes.find((tt) => !keptIds.has(tt._id.toString()) && tt.quantitySold > 0);
      if (removedWithSales) {
        throw Object.assign(
          new Error(`O ingresso "${removedWithSales.name}" já tem vendas e não pode ser removido. Reduza a quantidade em vez disso.`),
          { status: 400 }
        );
      }

      event.title = title;
      event.description = description;
      event.category = category;
      event.date = date;
      event.time = time;
      event.location = location;
      event.city = city;
      if (typeof imageUrl === 'string' && imageUrl) event.imageUrl = imageUrl;
      event.ticketTypes = nextTicketTypes;
      saved = await event.save({ session });
    });
  } catch (err) {
    return purchaseErrorResponse(res, err, 'Não foi possível salvar o evento.');
  } finally {
    await session.endSession();
  }
  res.json({ event: toPublicEvent(saved) });
}

export async function cancelEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (event.status === 'cancelled') {
    return res.status(409).json({ message: 'Este evento já está cancelado.' });
  }

  event.status = 'cancelled';
  await event.save();

  // reservas que ainda não foram pagas são canceladas: ninguém paga por um evento cancelado
  const pending = await Ticket.find({ event: event._id, status: 'pending_payment', paymentId: { $exists: false } });
  const seen = new Set();
  for (const t of pending) {
    const key = String(t.reservationId ?? t._id);
    if (seen.has(key)) continue;
    seen.add(key);
    await releaseReservation(t._id, 'event_cancelled');
  }

  res.json({ event: toPublicEvent(event) });
}

export async function deleteEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (event.status === 'deleted') {
    return res.status(409).json({ message: 'Este evento já foi removido.' });
  }

  // Soft delete: mark status and keep data for audit/recovery
  event.status = 'deleted';
  event.deletedAt = new Date();
  await event.save();

  res.json({ event: toPublicEvent(event) });
}

export async function restoreEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (event.status !== 'deleted') {
    return res.status(409).json({ message: 'Este evento não está removido.' });
  }

  event.status = 'active';
  event.deletedAt = undefined;
  await event.save();

  res.json({ event: toPublicEvent(event) });
}

export async function listDeletedEvents(req, res) {
  const events = await Event.find({ organizer: req.user._id, status: 'deleted' }).sort({ deletedAt: -1 });
  res.json({ events: events.map(toPublicEvent) });
}

export async function purgeEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (event.status !== 'deleted') {
    return res.status(409).json({ message: 'Somente eventos removidos podem ser apagados definitivamente.' });
  }
  // apagar de vez levaria junto ingressos pagos (sem reembolso) e reservas com pagamento em curso
  const activeTickets = await Ticket.countDocuments({ event: event._id, status: { $in: ['paid', 'pending_payment'] } });
  if (activeTickets > 0) {
    return res.status(409).json({
      message: 'Este evento tem ingressos pagos ou aguardando pagamento e não pode ser apagado definitivamente.',
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // remove related tickets and groups, then event
      await Ticket.deleteMany({ event: event._id }).session(session);
      await Group.deleteMany({ event: event._id }).session(session);
      await Event.deleteOne({ _id: event._id }).session(session);
    });
  } finally {
    await session.endSession();
  }

  res.status(204).send();
}

export const MAX_TICKETS_PER_PURCHASE = Number(process.env.MAX_TICKETS_PER_PURCHASE || 10);

export function generateTicketCode() {
  return randomCode(8);
}

// Erro de compra → resposta: id malformado vira 404 e erro interno não expõe detalhes.
export function purchaseErrorResponse(res, err, fallback) {
  if (err?.name === 'CastError') return res.status(404).json({ message: 'Não encontrado.' });
  const status = err?.status || 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ message: status >= 500 ? fallback : err.message });
}

// Uma nova compra substitui a reserva ainda não paga da mesma pessoa no mesmo evento:
// quem fecha o checkout e tenta de novo não fica segurando o estoque em dobro.
export async function releasePreviousReservations(buyerId, eventId) {
  const pending = await Ticket.find(
    { buyer: buyerId, event: eventId, status: 'pending_payment', paymentId: { $exists: false } },
    { _id: 1, reservationId: 1 }
  );
  const seen = new Set();
  for (const t of pending) {
    const key = String(t.reservationId ?? t._id);
    if (seen.has(key)) continue;
    seen.add(key);
    await releaseReservation(t._id, 'replaced');
  }
}

async function reserveTicket({ eventId, ticketTypeId, quantity, buyerId, session }) {
  const event = await Event.findById(eventId).session(session);
  if (!event || event.status === 'deleted') {
    const err = new Error('Evento não encontrado.');
    err.status = 404;
    throw err;
  }
  if (event.status !== 'active') {
    const err = new Error('Este evento foi cancelado e não está mais vendendo ingressos.');
    err.status = 409;
    throw err;
  }
  const ticketType = event.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    const err = new Error('Tipo de ingresso não encontrado.');
    err.status = 404;
    throw err;
  }
  const remaining = ticketType.quantityAvailable - ticketType.quantitySold;
  if (quantity > remaining) {
    const err = new Error(`Restam apenas ${remaining} ingressos deste tipo.`);
    err.status = 409;
    throw err;
  }
  // decrement counters
  ticketType.quantitySold += quantity;
  await event.save({ session });

  const [ticketDoc] = await Ticket.create(
    [
      {
        event: event._id,
        ticketTypeId: ticketType._id,
        buyer: buyerId,
        eventTitle: event.title,
        ticketTypeName: ticketType.name,
        quantity,
        totalPaid: ticketType.price * quantity,
        code: generateTicketCode(),
        status: 'pending_payment',
      },
    ],
    { session }
  );

  return { ticketDoc, eventDoc: event };
}

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 0);

export async function startCheckout({ ticketDoc, eventDoc, payerEmail, res, chargeAmount }) {
  const amount = chargeAmount ?? ticketDoc.totalPaid;

  // Ingresso grátis: não passa pelo Mercado Pago (que não aceita cobrança de R$ 0); já sai pago.
  if (amount === 0) {
    const paid = await markReservationPaid(ticketDoc, null);
    if (paid) sendPurchaseConfirmations(paid, eventDoc).catch(() => {});
    const ticket = paid?.[0] ?? ticketDoc;
    return res.status(201).json({ ticket: toPublicTicket(ticket), checkoutUrl: null, free: true });
  }

  if (!isPaymentsConfigured()) {
    await releaseReservation(ticketDoc._id);
    return res.status(503).json({
      message: 'Pagamentos ainda não configurados no servidor. Tente novamente mais tarde.',
    });
  }

  const organizer = await User.findById(eventDoc.organizer);
  const sellerAccessToken = organizer?.mpAccessToken ? decryptSecret(organizer.mpAccessToken) : null;
  if (!sellerAccessToken) {
    await releaseReservation(ticketDoc._id);
    return res.status(409).json({
      message: 'O organizador deste evento ainda não conectou uma conta para receber pagamentos.',
    });
  }

  try {
    const marketplaceFee = Math.round(amount * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const { preferenceId, checkoutUrl } = await createPaymentPreference({
      ticketId: ticketDoc._id.toString(),
      title: `${ticketDoc.quantity}x ${ticketDoc.ticketTypeName} — ${eventDoc.title}`,
      unitPrice: amount / ticketDoc.quantity,
      quantity: ticketDoc.quantity,
      payerEmail,
      sellerAccessToken,
      marketplaceFee,
      // o link de pagamento vence junto com a reserva
      expiresAt: new Date(ticketDoc.createdAt.getTime() + RESERVATION_TTL_MS),
    });

    await Ticket.updateOne({ _id: ticketDoc._id }, { $set: { paymentPreferenceId: preferenceId } });
    ticketDoc.paymentPreferenceId = preferenceId;

    res.status(201).json({ ticket: toPublicTicket(ticketDoc), checkoutUrl });
  } catch (err) {
    await releaseReservation(ticketDoc._id);
    res.status(500).json({ message: 'Não foi possível iniciar o pagamento. Tente novamente.' });
  }
}

export async function purchaseTicket(req, res) {
  const { id: eventId } = req.params;
  const { ticketTypeId, quantity } = req.body;

  if (!isNonEmptyString(ticketTypeId) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Dados de compra inválidos.' });
  }
  if (quantity > MAX_TICKETS_PER_PURCHASE) {
    return res.status(400).json({ message: `Máximo de ${MAX_TICKETS_PER_PURCHASE} ingressos por compra.` });
  }

  try {
    await releasePreviousReservations(req.user._id, eventId);
  } catch (err) {
    return purchaseErrorResponse(res, err, 'Erro ao comprar ingresso.');
  }

  const session = await mongoose.startSession();
  let ticketDoc;
  let eventDoc;
  try {
    await session.withTransaction(async () => {
      const result = await reserveTicket({
        eventId,
        ticketTypeId,
        quantity,
        buyerId: req.user._id,
        session,
      });
      ticketDoc = result.ticketDoc;
      eventDoc = result.eventDoc;
    });
  } catch (err) {
    return purchaseErrorResponse(res, err, 'Erro ao comprar ingresso.');
  } finally {
    await session.endSession();
  }

  await startCheckout({ ticketDoc, eventDoc, payerEmail: req.user.email, res });
}

export async function guestPurchase(req, res) {
  const { id: eventId } = req.params;
  const { name, email, ticketTypeId, quantity } = req.body;

  if (
    !isNonEmptyString(name) ||
    !isValidEmail(email) ||
    !isNonEmptyString(ticketTypeId) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return res.status(400).json({ message: 'Preencha nome, email válido e a quantidade de ingressos.' });
  }
  if (quantity > MAX_TICKETS_PER_PURCHASE) {
    return res.status(400).json({ message: `Máximo de ${MAX_TICKETS_PER_PURCHASE} ingressos por compra.` });
  }
  const buyerEmail = email.trim().toLowerCase();

  try {
    const existingBuyer = await User.findOne({ email: buyerEmail });
    if (existingBuyer) await releasePreviousReservations(existingBuyer._id, eventId);
  } catch (err) {
    return purchaseErrorResponse(res, err, 'Erro ao comprar ingresso.');
  }

  const session = await mongoose.startSession();
  let ticketDoc;
  let eventDoc;
  try {
    await session.withTransaction(async () => {
      let buyer = await User.findOne({ email: buyerEmail }).session(session);
      if (!buyer) {
        const createdUsers = await User.create(
          [{ name: name.trim().slice(0, 120), email: buyerEmail, role: 'buyer' }],
          { session }
        );
        buyer = createdUsers[0];
      }

      const result = await reserveTicket({
        eventId,
        ticketTypeId,
        quantity,
        buyerId: buyer._id,
        session,
      });
      ticketDoc = result.ticketDoc;
      eventDoc = result.eventDoc;
    });
  } catch (err) {
    return purchaseErrorResponse(res, err, 'Erro ao comprar ingresso.');
  } finally {
    await session.endSession();
  }

  await startCheckout({ ticketDoc, eventDoc, payerEmail: buyerEmail, res });
}
