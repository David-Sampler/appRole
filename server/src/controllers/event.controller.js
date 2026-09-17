import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { toPublicEvent, toPublicTicket } from '../utils/serialize.js';
import { createPaymentPreference, isPaymentsConfigured } from '../utils/mercadopago.js';

export async function listEvents(req, res) {
  const { search, category, city } = req.query;
  const filter = { status: 'active' };
  if (category) filter.category = category;
  if (city) filter.city = { $regex: `^${city}$`, $options: 'i' };
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
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

  if (!title || !description || !category || !date || !time || !location || !city) {
    return res.status(400).json({ message: 'Preencha todos os campos do evento, incluindo a cidade.' });
  }
  if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
    return res.status(400).json({ message: 'Adicione pelo menos um tipo de ingresso.' });
  }
  for (const tt of ticketTypes) {
    if (!tt.name || typeof tt.price !== 'number' || tt.price < 0) {
      return res.status(400).json({ message: 'Tipo de ingresso inválido.' });
    }
    if (!Number.isInteger(tt.quantityAvailable) || tt.quantityAvailable <= 0) {
      return res.status(400).json({ message: 'Quantidade de ingresso inválida.' });
    }
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
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }
  if (event.status === 'cancelled') {
    return res.status(409).json({ message: 'Este evento foi cancelado e não pode ser editado.' });
  }

  const { title, description, category, date, time, location, city, imageUrl, ticketTypes } = req.body;

  if (!title || !description || !category || !date || !time || !location || !city) {
    return res.status(400).json({ message: 'Preencha todos os campos do evento, incluindo a cidade.' });
  }
  if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
    return res.status(400).json({ message: 'Adicione pelo menos um tipo de ingresso.' });
  }

  const existingTypesById = new Map(event.ticketTypes.map((tt) => [tt._id.toString(), tt]));
  const nextTicketTypes = [];
  for (const tt of ticketTypes) {
    if (!tt.name || typeof tt.price !== 'number' || tt.price < 0) {
      return res.status(400).json({ message: 'Tipo de ingresso inválido.' });
    }
    if (!Number.isInteger(tt.quantityAvailable) || tt.quantityAvailable <= 0) {
      return res.status(400).json({ message: 'Quantidade de ingresso inválida.' });
    }

    const existing = tt.id ? existingTypesById.get(tt.id) : null;
    const quantitySold = existing?.quantitySold ?? 0;
    if (tt.quantityAvailable < quantitySold) {
      return res.status(400).json({
        message: `A quantidade de "${tt.name}" não pode ser menor que ${quantitySold} (já vendidos).`,
      });
    }

    nextTicketTypes.push(
      existing
        ? { _id: existing._id, name: tt.name, price: tt.price, quantityAvailable: tt.quantityAvailable, quantitySold }
        : { name: tt.name, price: tt.price, quantityAvailable: tt.quantityAvailable, quantitySold: 0 }
    );
  }

  event.title = title;
  event.description = description;
  event.category = category;
  event.date = date;
  event.time = time;
  event.location = location;
  event.city = city;
  event.imageUrl = imageUrl || event.imageUrl;
  event.ticketTypes = nextTicketTypes;

  await event.save();
  res.json({ event: toPublicEvent(event) });
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

function generateTicketCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function reserveTicket({ eventId, ticketTypeId, quantity, buyerId, session, groupId }) {
  const event = await Event.findById(eventId).session(session);
  if (!event) {
    const err = new Error('Evento não encontrado.');
    err.status = 404;
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

  // If groupId provided, reserve seats in group and create individual ticket docs grouped by reservationId
  if (groupId) {
    const group = await Group.findById(groupId).session(session);
    if (!group) {
      const err = new Error('Mesa/Grupo não encontrado.');
      err.status = 404;
      throw err;
    }
    if (group.seatsLeft < quantity) {
      const err = new Error(`Restam apenas ${group.seatsLeft} lugares nesta mesa.`);
      err.status = 409;
      throw err;
    }

    group.seatsLeft -= quantity;
    await group.save({ session });

    // create individual ticket documents; include attendee info when provided
    const ticketDocs = await Ticket.create(
      Array.from({ length: quantity }).map((_, idx) => {
        const attendee = Array.isArray(attendees) ? attendees[idx] : null;
        return {
          event: event._id,
          ticketTypeId: ticketType._id,
          buyer: buyerId,
          eventTitle: event.title,
          ticketTypeName: ticketType.name,
          quantity: 1,
          totalPaid: ticketType.price,
          code: generateTicketCode(),
          status: 'pending_payment',
          groupId: group._id,
          groupCode: group.code,
          groupName: group.name,
          attendeeName: attendee?.name ?? undefined,
          attendeeEmail: attendee?.email ?? undefined,
        };
      }),
      { session }
    );

    const reservationId = ticketDocs[0]._id;
    const ids = ticketDocs.map((t) => t._id);
    await Ticket.updateMany({ _id: { $in: ids } }, { $set: { reservationId } }, { session });

    // update the first ticket to act as representative for checkout (aggregate total)
    const first = await Ticket.findById(reservationId).session(session);
    first.quantity = quantity;
    first.totalPaid = ticketType.price * quantity;
    await first.save({ session });

    return { ticketDoc: first, eventDoc: event };
  }

  // default: single-ticket reservation (existing behavior)
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

async function releaseReservation(ticketId) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return;

  if (ticket.reservationId) {
    // cancel all tickets in reservation
    const tickets = await Ticket.find({ reservationId: ticket.reservationId, status: 'pending_payment' });
    if (!tickets || tickets.length === 0) return;
    const event = await Event.findById(ticket.event);
    if (event) {
      const ticketType = event.ticketTypes.id(ticket.ticketTypeId);
      if (ticketType) {
        const qty = tickets.length;
        ticketType.quantitySold = Math.max(0, ticketType.quantitySold - qty);
        await event.save();
      }
    }

    // restore group seats if any
    const groupId = ticket.groupId;
    if (groupId) {
      const group = await Group.findById(groupId);
      if (group) {
        group.seatsLeft = Math.min(group.size, group.seatsLeft + tickets.length);
        await group.save();
      }
    }

    await Ticket.updateMany({ reservationId: ticket.reservationId, status: 'pending_payment' }, { $set: { status: 'cancelled' } });
    return;
  }

  if (ticket.status !== 'pending_payment') return;

  const event = await Event.findById(ticket.event);
  if (event) {
    const ticketType = event.ticketTypes.id(ticket.ticketTypeId);
    if (ticketType) {
      ticketType.quantitySold = Math.max(0, ticketType.quantitySold - ticket.quantity);
      await event.save();
    }
  }
  ticket.status = 'cancelled';
  await ticket.save();
}

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 0);

async function startCheckout({ ticketDoc, eventDoc, payerEmail, res }) {
  if (!isPaymentsConfigured()) {
    await releaseReservation(ticketDoc._id);
    return res.status(503).json({
      message: 'Pagamentos ainda não configurados no servidor. Tente novamente mais tarde.',
    });
  }

  const organizer = await User.findById(eventDoc.organizer);
  if (!organizer?.mpAccessToken) {
    await releaseReservation(ticketDoc._id);
    return res.status(409).json({
      message: 'O organizador deste evento ainda não conectou uma conta para receber pagamentos.',
    });
  }

  try {
    const marketplaceFee = Math.round(ticketDoc.totalPaid * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const { preferenceId, checkoutUrl } = await createPaymentPreference({
      ticketId: ticketDoc._id.toString(),
      title: `${ticketDoc.quantity}x ${ticketDoc.ticketTypeName} — ${eventDoc.title}`,
      unitPrice: ticketDoc.totalPaid / ticketDoc.quantity,
      quantity: ticketDoc.quantity,
      payerEmail,
      sellerAccessToken: organizer.mpAccessToken,
      marketplaceFee,
    });

    ticketDoc.paymentPreferenceId = preferenceId;
    await ticketDoc.save();

    res.status(201).json({ ticket: toPublicTicket(ticketDoc), checkoutUrl });
  } catch (err) {
    await releaseReservation(ticketDoc._id);
    res.status(500).json({ message: 'Não foi possível iniciar o pagamento. Tente novamente.' });
  }
}

export async function purchaseTicket(req, res) {
  const { id: eventId } = req.params;
  const { ticketTypeId, quantity, groupId, attendees } = req.body;

  if (!ticketTypeId || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Dados de compra inválidos.' });
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
        groupId,
        attendees,
      });
      ticketDoc = result.ticketDoc;
      eventDoc = result.eventDoc;
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Erro ao comprar ingresso.' });
  } finally {
    await session.endSession();
  }

  await startCheckout({ ticketDoc, eventDoc, payerEmail: req.user.email, res });
}

export async function guestPurchase(req, res) {
  const { id: eventId } = req.params;
  const { name, email, ticketTypeId, quantity, groupId, attendees } = req.body;

  if (!name || !email || !ticketTypeId || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Preencha nome, email e a quantidade de ingressos.' });
  }

  const session = await mongoose.startSession();
  let ticketDoc;
  let eventDoc;
  try {
    await session.withTransaction(async () => {
      let buyer = await User.findOne({ email: email.toLowerCase() }).session(session);
      if (!buyer) {
        const createdUsers = await User.create(
          [{ name, email: email.toLowerCase(), role: 'buyer' }],
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
        groupId,
        attendees,
      });
      ticketDoc = result.ticketDoc;
      eventDoc = result.eventDoc;
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Erro ao comprar ingresso.' });
  } finally {
    await session.endSession();
  }

  await startCheckout({ ticketDoc, eventDoc, payerEmail: email, res });
}
