import mongoose from 'mongoose';
import Group from '../models/Group.js';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import { toPublicGroup } from '../utils/serialize.js';
import { startCheckout } from './event.controller.js';

function generateGroupCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function generateTicketCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function createGroup(req, res) {
  const { id: eventId } = req.params;
  const { name, size, price } = req.body;

  if (!name || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ message: 'Nome e número de pessoas válidos são obrigatórios.' });
  }
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
    return res.status(400).json({ message: 'Valor da mesa inválido.' });
  }

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }

  const group = await Group.create({
    event: event._id,
    name,
    size,
    seatsLeft: size,
    price,
    code: generateGroupCode(),
    organizer: req.user._id,
  });
  res.status(201).json({ group: toPublicGroup(group) });
}

export async function listGroups(req, res) {
  const { id: eventId } = req.params;
  const groups = await Group.find({ event: eventId }).sort({ createdAt: 1 });
  res.json({ groups: groups.map(toPublicGroup) });
}

export async function purchaseGroup(req, res) {
  const { id: groupId } = req.params;
  const { attendees } = req.body;

  const session = await mongoose.startSession();
  let ticketDoc;
  let eventDoc;
  try {
    await session.withTransaction(async () => {
      const group = await Group.findById(groupId).session(session);
      if (!group) {
        const err = new Error('Mesa não encontrada.');
        err.status = 404;
        throw err;
      }
      if (group.status !== 'available' || group.seatsLeft !== group.size) {
        const err = new Error('Esta mesa já foi vendida.');
        err.status = 409;
        throw err;
      }

      if (
        !Array.isArray(attendees) ||
        attendees.length !== group.size ||
        attendees.some((a) => !a || typeof a.name !== 'string' || !a.name.trim())
      ) {
        const err = new Error(`Informe o nome das ${group.size} pessoas da mesa.`);
        err.status = 400;
        throw err;
      }

      const event = await Event.findById(group.event).session(session);
      if (!event || event.status !== 'active') {
        const err = new Error('Evento indisponível.');
        err.status = 404;
        throw err;
      }

      group.status = 'sold';
      group.seatsLeft = 0;
      await group.save({ session });

      const ticketDocs = await Ticket.create(
        Array.from({ length: group.size }).map((_, idx) => ({
          event: event._id,
          buyer: req.user._id,
          eventTitle: event.title,
          ticketTypeName: `Mesa: ${group.name}`,
          quantity: 1,
          totalPaid: idx === 0 ? group.price : 0,
          code: generateTicketCode(),
          status: 'pending_payment',
          groupId: group._id,
          groupCode: group.code,
          groupName: group.name,
          groupSeatIndex: idx,
          attendeeName: attendees[idx].name.trim(),
          attendeeEmail: attendees[idx].email ? String(attendees[idx].email).toLowerCase().trim() : undefined,
        })),
        { session }
      );

      const reservationId = ticketDocs[0]._id;
      await Ticket.updateMany(
        { _id: { $in: ticketDocs.map((t) => t._id) } },
        { $set: { reservationId } },
        { session }
      );

      const first = await Ticket.findById(reservationId).session(session);
      first.quantity = group.size;
      await first.save({ session });

      ticketDoc = first;
      eventDoc = event;
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Erro ao comprar mesa.' });
  } finally {
    await session.endSession();
  }

  await startCheckout({ ticketDoc, eventDoc, payerEmail: req.user.email, res });
}

export async function checkInGroup(req, res) {
  const { code } = req.params;
  const group = await Group.findOne({ code: code.trim().toUpperCase() });
  if (!group) return res.status(404).json({ message: 'Mesa não encontrada.' });

  const event = await Event.findById(group.event);
  if (!event || event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }

  const tickets = await Ticket.find({ groupId: group._id, status: 'paid' }).sort({ groupSeatIndex: 1 });
  if (!tickets || tickets.length === 0) {
    return res.status(404).json({ message: 'Nenhum ingresso pago encontrado para esta mesa.' });
  }

  const now = new Date();
  for (const t of tickets) {
    if (!t.checkedInAt) {
      t.checkedInAt = now;
      await t.save();
    }
  }

  res.json({
    message: `Validado(s) ${tickets.length} ingresso(s) da mesa ${group.name}.`,
    attendees: tickets.map((t) => ({ name: t.attendeeName, checkedInAt: t.checkedInAt })),
  });
}
