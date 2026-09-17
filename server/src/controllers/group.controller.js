import Group from '../models/Group.js';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';

export async function createGroup(req, res) {
  const { id: eventId } = req.params;
  const { name, size } = req.body;

  if (!name || !Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ message: 'Nome e tamanho válidos são obrigatórios.' });
  }

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });
  if (event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }

  // generate simple code
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();

  const group = await Group.create({ event: event._id, name, size, seatsLeft: size, code, organizer: req.user._id });
  res.status(201).json({ group });
}

export async function listGroups(req, res) {
  const { id: eventId } = req.params;
  const groups = await Group.find({ event: eventId }).sort({ createdAt: 1 });
  res.json({ groups });
}

export async function checkInGroup(req, res) {
  const { code } = req.params;
  const group = await Group.findOne({ code: code.trim().toUpperCase() });
  if (!group) return res.status(404).json({ message: 'Mesa não encontrada.' });

  const event = await Event.findById(group.event);
  if (!event || event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Você não é o organizador deste evento.' });
  }

  const tickets = await Ticket.find({ groupId: group._id, status: 'paid' });
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

  res.json({ message: `Validado(s) ${tickets.length} ingresso(s) da mesa ${group.name}.` });
}
