import Ticket from '../models/Ticket.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { getPayment, getOAuthAuthorizationUrl, exchangeOAuthCode, refundPayment } from '../utils/mercadopago.js';
import { releaseReservation } from './event.controller.js';
import { sendTicketConfirmationEmail } from '../utils/mailer.js';
import { signOAuthState, verifyOAuthState } from '../utils/jwt.js';
import { pageLayout } from '../views/layout.js';
import { encryptSecret, decryptSecret } from '../utils/security.js';
import crypto from 'node:crypto';

// Assinatura do webhook (painel do Mercado Pago → Webhooks → "Assinatura secreta").
// Só é exigida quando MERCADOPAGO_WEBHOOK_SECRET está configurada.
function hasValidWebhookSignature(req) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=')).filter((kv) => kv.length === 2)
  );
  if (!parts.ts || !parts.v1) return false;
  const dataId = String(req.query['data.id'] ?? req.body?.data?.id ?? '').toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O pagamento precisa corresponder à compra: mesmo valor (ou mais), em reais, e pago ao
// organizador do evento. Sem isso, alguém poderia "pagar" o ingresso de outro evento com R$ 0,01.
function paymentMatchesTickets(payment, tickets, organizer) {
  const expected = tickets.reduce((sum, t) => sum + (t.totalPaid || 0), 0);
  const tolerance = 0.01 * tickets.length; // arredondamento do preço por pessoa da mesa
  if (typeof payment.transaction_amount !== 'number' || payment.transaction_amount + tolerance < expected) {
    return `valor ${payment.transaction_amount} menor que o esperado ${expected}`;
  }
  if (payment.currency_id && payment.currency_id !== 'BRL') return `moeda ${payment.currency_id}`;
  if (organizer?.mpUserId && payment.collector_id != null && String(payment.collector_id) !== String(organizer.mpUserId)) {
    return `recebedor ${payment.collector_id} não é o organizador ${organizer.mpUserId}`;
  }
  return null;
}

// motivos de cancelamento em que a pessoa ainda pode pagar e recuperar a vaga
const RECLAIMABLE_REASONS = ['expired', 'replaced'];

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
      mpAccessToken: encryptSecret(tokenResponse.access_token),
      mpRefreshToken: encryptSecret(tokenResponse.refresh_token),
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
  if (!hasValidWebhookSignature(req)) {
    console.warn(`Webhook com assinatura inválida recusado (pagamento ${paymentId}).`);
    return res.status(401).send('invalid signature');
  }

  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch (err) {
    console.error('Erro ao buscar pagamento no Mercado Pago:', err.message);
    return res.status(200).send('error fetching payment');
  }

  const ticketId = payment.external_reference;
  // external_reference é o id do ingresso; numa mesa, é o id do 1º ingresso, que também é o
  // reservationId — então buscamos todos os ingressos da reserva, não só o primeiro
  let tickets = [];
  if (ticketId) {
    const single = await Ticket.findById(ticketId).catch(() => null);
    if (single?.reservationId) tickets = await Ticket.find({ reservationId: single.reservationId });
    else if (single) tickets = [single];
    else tickets = await Ticket.find({ reservationId: ticketId }).catch(() => []);
  }

  if (!tickets || tickets.length === 0) {
    return res.status(200).send('ticket not found');
  }

  const paymentIdStr = String(payment.id);
  const ticketEvent = await Event.findById(tickets[0].event);
  const organizer = ticketEvent ? await User.findById(ticketEvent.organizer) : null;

  const mismatch = paymentMatchesTickets(payment, tickets, organizer);
  if (mismatch) {
    console.warn(`Pagamento ${paymentIdStr} ignorado para a reserva ${ticketId}: ${mismatch}`);
    return res.status(200).send('payment does not match purchase');
  }

  const expiredBeforePayment = tickets.every(
    (t) => t.status === 'cancelled' && RECLAIMABLE_REASONS.includes(t.cancelReason)
  );

  if (payment.status === 'approved' && expiredBeforePayment) {
    // pagou depois que a reserva venceu: tenta segurar a vaga de novo; se não der, devolve o dinheiro
    const reclaimed = await reclaimExpiredReservation(tickets);
    if (!reclaimed) {
      try {
        await refundPayment(paymentIdStr, decryptSecret(organizer?.mpAccessToken));
        await Ticket.updateMany(
          { _id: { $in: tickets.map((t) => t._id) } },
          { $set: { paymentId: paymentIdStr, cancelReason: 'expired_refunded' } }
        );
      } catch (err) {
        console.error(`Pagamento ${paymentIdStr} aprovado após reserva expirar e o reembolso falhou:`, err.message);
        return res.status(500).send('refund failed'); // o Mercado Pago tenta notificar de novo
      }
      return res.status(200).send('expired reservation refunded');
    }
  } else if (!tickets.every((t) => t.status === 'pending_payment')) {
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
    // devolve o estoque pela quantidade real do ingresso (antes contava 1 por documento) e libera a mesa
    await releaseReservation(tickets[0]._id, 'payment_rejected');
    await Ticket.updateMany({ _id: { $in: tickets.map((t) => t._id) } }, { $set: { paymentId: paymentIdStr } });
  } else {
    // "pending"/"in_process" (ex: Pix ou boleto aguardando): guarda o pagamento para a reserva
    // não ser expirada enquanto o Mercado Pago não confirma ou cancela
    await Ticket.updateMany({ _id: { $in: tickets.map((t) => t._id) } }, { $set: { paymentId: paymentIdStr } });
  }

  res.status(200).send('ok');
}

// Volta a reservar estoque/mesa para ingressos que expiraram antes do pagamento ser aprovado.
// Retorna true se conseguiu (os ingressos voltam a "pending_payment" para serem marcados como pagos).
async function reclaimExpiredReservation(tickets) {
  const event = await Event.findById(tickets[0].event);
  if (!event || event.status !== 'active') return false;

  const groupId = tickets[0].groupId;
  if (groupId) {
    const group = await Group.findOneAndUpdate(
      { _id: groupId, status: 'available', size: tickets.length },
      { $set: { status: 'sold', seatsLeft: 0 } },
      { new: true }
    );
    if (!group) return false;
  } else {
    const ticketType = event.ticketTypes.id(tickets[0].ticketTypeId);
    const quantity = tickets[0].quantity;
    if (!ticketType || ticketType.quantityAvailable - ticketType.quantitySold < quantity) return false;
    ticketType.quantitySold += quantity;
    await event.save();
  }

  for (const t of tickets) {
    t.status = 'pending_payment';
    t.cancelReason = undefined;
  }
  return true;
}
