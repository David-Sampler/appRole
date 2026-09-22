import Ticket from '../models/Ticket.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { getPayment, getOAuthAuthorizationUrl, exchangeOAuthCode } from '../utils/mercadopago.js';
import { sendTicketConfirmationEmail } from '../utils/mailer.js';
import { signOAuthState, verifyOAuthState } from '../utils/jwt.js';
import { pageLayout } from '../views/layout.js';

export async function connectMercadoPago(req, res) {
  const state = signOAuthState(req.user._id.toString());
  const url = getOAuthAuthorizationUrl(state);
  res.json({ url });
}

export async function mercadoPagoCallback(req, res) {
  const { code, state } = req.query;

  let organizerId;
  try {
    ({ organizerId } = verifyOAuthState(state));
  } catch {
    return res
      .status(400)
      .send(pageLayout('Erro', '<p>Link de conexão inválido ou expirado. Tente conectar novamente pelo app.</p>'));
  }

  if (!code) {
    return res.status(400).send(pageLayout('Erro', '<p>Autorização não concedida.</p>'));
  }

  try {
    const tokenResponse = await exchangeOAuthCode(code);
    await User.findByIdAndUpdate(organizerId, {
      mpUserId: String(tokenResponse.user_id),
      mpAccessToken: tokenResponse.access_token,
      mpRefreshToken: tokenResponse.refresh_token,
      mpConnectedAt: new Date(),
    });
  } catch (err) {
    console.error('Erro ao conectar Mercado Pago:', err.message);
    return res
      .status(500)
      .send(pageLayout('Erro', '<p>Não foi possível conectar sua conta. Tente novamente.</p>'));
  }

  res.send(
    pageLayout(
      'Conta conectada',
      '<div class="card" style="text-align:center;"><p class="success">✅ Conta do Mercado Pago conectada com sucesso!</p><p class="muted">Pode voltar para o app.</p></div>'
    )
  );
}

export async function paymentWebhook(req, res) {
  const type = req.body?.type || req.query.type;
  const paymentId = req.body?.data?.id || req.query['data.id'];

  if (type !== 'payment' || !paymentId) {
    return res.status(200).send('ignored');
  }

  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch (err) {
    console.error('Erro ao buscar pagamento no Mercado Pago:', err.message);
    return res.status(200).send('error fetching payment');
  }

  const ticketId = payment.external_reference;
  // attempt to find a single ticket by id or multiple tickets by reservationId
  let tickets = [];
  if (ticketId) {
    const single = await Ticket.findById(ticketId).catch(() => null);
    if (single) tickets = [single];
    else tickets = await Ticket.find({ reservationId: ticketId });
  }

  if (!tickets || tickets.length === 0) {
    return res.status(200).send('ticket not found');
  }

  // ignore already processed
  if (!tickets.every((t) => t.status === 'pending_payment')) {
    return res.status(200).send('already processed');
  }

  if (payment.status === 'approved') {
    for (const t of tickets) {
      t.status = 'paid';
      t.paymentId = String(payment.id);
      await t.save();
    }

    const event = await Event.findById(tickets[0].event);
    const isGroupPurchase = tickets.some((t) => t.groupId);

    if (event && isGroupPurchase) {
      // mesa: cada pessoa recebe seu próprio ingresso/QR code por email
      for (const t of tickets) {
        if (!t.attendeeEmail) continue;
        sendTicketConfirmationEmail(t.attendeeEmail, {
          event,
          ticketTypeName: t.ticketTypeName,
          quantity: 1,
          totalPaid: t.totalPaid || 0,
          code: t.code,
        }).catch((err) => console.error(`Falha ao enviar email da mesa para ${t.attendeeEmail}:`, err.message));
      }
    } else if (event) {
      const buyer = await User.findById(tickets[0].buyer);
      if (buyer) {
        sendTicketConfirmationEmail(buyer.email, {
          event,
          ticketTypeName: tickets[0].ticketTypeName,
          quantity: tickets.length,
          totalPaid: tickets.reduce((s, x) => s + (x.totalPaid || 0), 0),
          code: tickets[0].code,
        }).catch((err) => console.error('Falha ao enviar email de confirmação:', err.message));
      }
    }
  } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
    const event = await Event.findById(tickets[0].event);
    if (event && tickets[0].ticketTypeId) {
      const ticketType = event.ticketTypes.id(tickets[0].ticketTypeId);
      if (ticketType) {
        ticketType.quantitySold = Math.max(0, ticketType.quantitySold - tickets.length);
        await event.save();
      }
    }

    // restore group seats if present
    const groupId = tickets[0].groupId;
    if (groupId) {
      const Group = (await import('../models/Group.js')).default;
      const group = await Group.findById(groupId).catch(() => null);
      if (group) {
        group.seatsLeft = Math.min(group.size, group.seatsLeft + tickets.length);
        if (group.seatsLeft >= group.size) group.status = 'available';
        await group.save();
      }
    }

    await Ticket.updateMany({ _id: { $in: tickets.map((t) => t._id) } }, { $set: { status: 'cancelled', paymentId: String(payment.id) } });
  }
  // status "pending" (ex: boleto/pix aguardando): não faz nada, aguarda próxima notificação

  res.status(200).send('ok');
}
