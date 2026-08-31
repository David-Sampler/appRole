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
  const ticket = ticketId ? await Ticket.findById(ticketId) : null;
  if (!ticket) {
    return res.status(200).send('ticket not found');
  }

  if (ticket.status !== 'pending_payment') {
    return res.status(200).send('already processed');
  }

  if (payment.status === 'approved') {
    ticket.status = 'paid';
    ticket.paymentId = String(payment.id);
    await ticket.save();

    const event = await Event.findById(ticket.event);
    const buyer = await User.findById(ticket.buyer);
    if (event && buyer) {
      sendTicketConfirmationEmail(buyer.email, {
        event,
        ticketTypeName: ticket.ticketTypeName,
        quantity: ticket.quantity,
        totalPaid: ticket.totalPaid,
        code: ticket.code,
      }).catch((err) => console.error('Falha ao enviar email de confirmação:', err.message));
    }
  } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
    const event = await Event.findById(ticket.event);
    if (event) {
      const ticketType = event.ticketTypes.id(ticket.ticketTypeId);
      if (ticketType) {
        ticketType.quantitySold = Math.max(0, ticketType.quantitySold - ticket.quantity);
        await event.save();
      }
    }
    ticket.status = 'cancelled';
    ticket.paymentId = String(payment.id);
    await ticket.save();
  }
  // status "pending" (ex: boleto/pix aguardando): não faz nada, aguarda próxima notificação

  res.status(200).send('ok');
}
