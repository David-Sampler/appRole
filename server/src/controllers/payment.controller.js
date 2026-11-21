import Ticket from '../models/Ticket.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { getPayment, getOAuthAuthorizationUrl, exchangeOAuthCode, refundPayment } from '../utils/mercadopago.js';
import { releaseReservation, markReservationPaid, reclaimReservation, leaderIdOf } from '../services/reservations.js';
import { sendPurchaseConfirmations } from '../services/confirmations.js';
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
const RECLAIMABLE_REASONS = ['expired', 'replaced', 'payment_rejected'];

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


// Motivos de cancelamento que já são finais (dinheiro devolvido / cancelado pelo comprador / em processamento).
const FINAL_REASONS = ['expired_refunded', 'event_cancelled_refunded', 'refunded_unfulfilled', 'buyer_cancelled', 'reclaiming', 'refunding'];

// Devolve o dinheiro de um pagamento que não virou ingresso. A trava (cancelReason → 'refunding')
// garante um único reembolso mesmo com avisos duplicados. Lança erro se o reembolso falhar.
async function refundUnfulfilled({ leaderId, fromReason, revertTo, finalReason, paymentId, organizer }) {
  const locked = await Ticket.findOneAndUpdate(
    { _id: leaderId, status: 'cancelled', cancelReason: fromReason },
    { $set: { cancelReason: 'refunding' } }
  );
  if (!locked) return false;
  try {
    await refundPayment(paymentId, decryptSecret(organizer?.mpAccessToken));
  } catch (err) {
    await Ticket.updateOne({ _id: leaderId }, { $set: { cancelReason: revertTo ?? fromReason } });
    throw err;
  }
  await Ticket.updateMany(
    { $or: [{ _id: leaderId }, { reservationId: leaderId }] },
    { $set: { cancelReason: finalReason, paymentId } }
  );
  return true;
}

export async function paymentWebhook(req, res) {
  const type = req.body?.type || req.query.type;
  const paymentId = req.body?.data?.id || req.query['data.id'];

  if (type !== 'payment' || !paymentId || (typeof paymentId !== 'string' && typeof paymentId !== 'number')) {
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

  // external_reference é o id do ingresso; numa mesa, é o id do 1º ingresso (= reservationId)
  const ticketId = payment?.external_reference;
  const first = ticketId ? await Ticket.findById(ticketId).catch(() => null) : null;
  if (!first) return res.status(200).send('ticket not found');
  const leaderId = leaderIdOf(first);
  const tickets = first.reservationId ? await Ticket.find({ reservationId: leaderId }) : [first];

  const paymentIdStr = String(payment.id);
  const ticketEvent = await Event.findById(first.event);
  const organizer = ticketEvent ? await User.findById(ticketEvent.organizer) : null;

  const mismatch = paymentMatchesTickets(payment, tickets, organizer);
  if (mismatch) {
    console.warn(`Pagamento ${paymentIdStr} ignorado para a reserva ${ticketId}: ${mismatch}`);
    return res.status(200).send('payment does not match purchase');
  }

  const ids = tickets.map((t) => t._id);

  if (payment.status === 'rejected' || payment.status === 'cancelled') {
    // devolve estoque/mesa (só quem vencer a trava do líder processa)
    if (await releaseReservation(leaderId, 'payment_rejected')) {
      await Ticket.updateMany({ _id: { $in: ids } }, { $set: { paymentId: paymentIdStr } });
    }
    return res.status(200).send('ok');
  }

  if (payment.status !== 'approved') {
    // "pending"/"in_process" (Pix/boleto aguardando): guarda o pagamento para a reserva não expirar
    await Ticket.updateMany({ _id: { $in: ids }, status: 'pending_payment' }, { $set: { paymentId: paymentIdStr } });
    return res.status(200).send('ok');
  }

  // ---- pagamento aprovado ----
  const eventActive = ticketEvent?.status === 'active';
  if (!eventActive) await releaseReservation(leaderId, 'event_cancelled');

  let paid = eventActive ? await markReservationPaid(first, paymentIdStr) : null;
  if (paid) {
    sendPurchaseConfirmations(paid, ticketEvent).catch(() => {});
    return res.status(200).send('ok');
  }

  // não estava mais pendente: já pago, ou cancelado (expirou, foi substituído, recusado antes...)
  const leader = await Ticket.findById(leaderId);
  if (!leader || leader.status === 'paid') return res.status(200).send('already processed');
  if (leader.status !== 'cancelled' || FINAL_REASONS.includes(leader.cancelReason)) {
    return res.status(200).send('already processed');
  }

  try {
    if (eventActive && RECLAIMABLE_REASONS.includes(leader.cancelReason)) {
      // pagou depois que a reserva venceu: tenta segurar a vaga de novo
      const claim = await reclaimReservation(leader, RECLAIMABLE_REASONS, paymentIdStr);
      if (claim.result === 'busy') return res.status(200).send('already processed');
      if (claim.result === 'reclaimed') {
        paid = await markReservationPaid(leader, paymentIdStr);
        if (paid) sendPurchaseConfirmations(paid, ticketEvent).catch(() => {});
        return res.status(200).send('ok');
      }
      // vaga não existe mais: devolve o dinheiro
      await refundUnfulfilled({
        leaderId, fromReason: 'reclaiming', revertTo: claim.originalReason,
        finalReason: 'expired_refunded', paymentId: paymentIdStr, organizer,
      });
      return res.status(200).send('expired reservation refunded');
    }

    // evento cancelado (ou reserva sem volta): devolve o dinheiro
    const refunded = await refundUnfulfilled({
      leaderId, fromReason: leader.cancelReason,
      finalReason: eventActive ? 'refunded_unfulfilled' : 'event_cancelled_refunded',
      paymentId: paymentIdStr, organizer,
    });
    return res.status(200).send(refunded ? 'refunded' : 'already processed');
  } catch (err) {
    console.error(`Pagamento ${paymentIdStr}: reembolso falhou:`, err.message);
    return res.status(500).send('refund failed'); // o Mercado Pago tenta notificar de novo
  }
}
