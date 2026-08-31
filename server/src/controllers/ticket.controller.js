import Ticket from '../models/Ticket.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { toPublicTicket, toPublicEvent } from '../utils/serialize.js';
import { refundPayment } from '../utils/mercadopago.js';

export async function myTickets(req, res) {
  const tickets = await Ticket.find({ buyer: req.user._id }).sort({ createdAt: -1 });
  res.json({ tickets: tickets.map(toPublicTicket) });
}

export async function cancelTicket(req, res) {
  const ticket = await Ticket.findById(req.params.id);
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

  const event = await Event.findById(ticket.event);
  if (!event) return res.status(404).json({ message: 'Evento não encontrado.' });

  if (ticket.paymentId) {
    const organizer = await User.findById(event.organizer);
    try {
      await refundPayment(ticket.paymentId, organizer?.mpAccessToken);
    } catch (err) {
      return res.status(502).json({ message: 'Não foi possível processar o reembolso. Tente novamente mais tarde.' });
    }
  }

  const ticketType = event.ticketTypes.id(ticket.ticketTypeId);
  if (ticketType) {
    ticketType.quantitySold = Math.max(0, ticketType.quantitySold - ticket.quantity);
    await event.save();
  }

  ticket.status = 'cancelled';
  await ticket.save();

  res.json({ ticket: toPublicTicket(ticket) });
}

export async function getTicketByCode(req, res) {
  const ticket = await Ticket.findOne({ code: req.params.code.trim().toUpperCase() });
  if (!ticket) return res.status(404).json({ message: 'Ingresso não encontrado.' });

  const event = await Event.findById(ticket.event);
  res.json({ ticket: toPublicTicket(ticket), event: event ? toPublicEvent(event) : null });
}

export async function checkInTicket(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Código ausente.' });

  const ticket = await Ticket.findOne({ code: code.trim().toUpperCase() }).populate(
    'buyer',
    'name email'
  );
  if (!ticket) {
    return res.status(404).json({ message: 'Ingresso não encontrado.' });
  }

  const event = await Event.findById(ticket.event);
  if (!event || event.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Este ingresso não pertence a um evento seu.' });
  }

  if (ticket.status !== 'paid') {
    return res.status(409).json({
      message:
        ticket.status === 'pending_payment'
          ? 'Este ingresso ainda não foi pago.'
          : 'Este ingresso foi cancelado.',
    });
  }

  if (ticket.checkedInAt) {
    return res.status(409).json({
      message: 'Este ingresso já foi validado.',
      ticket: {
        buyerName: ticket.buyer?.name ?? 'Comprador removido',
        ticketTypeName: ticket.ticketTypeName,
        quantity: ticket.quantity,
        checkedInAt: ticket.checkedInAt,
      },
    });
  }

  ticket.checkedInAt = new Date();
  await ticket.save();

  res.json({
    message: 'Ingresso validado com sucesso!',
    ticket: {
      buyerName: ticket.buyer?.name ?? 'Comprador removido',
      ticketTypeName: ticket.ticketTypeName,
      quantity: ticket.quantity,
      checkedInAt: ticket.checkedInAt,
    },
  });
}
