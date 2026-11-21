import User from '../models/User.js';
import { sendTicketConfirmationEmail } from '../utils/mailer.js';

// Envia o(s) ingresso(s) por email depois do pagamento (ou na hora, se for grátis).
// Mesa: cada pessoa com email recebe o próprio QR. Compra avulsa: o comprador recebe.
export async function sendPurchaseConfirmations(tickets, event) {
  if (!event || !tickets?.length) return;
  const isGroupPurchase = tickets.some((t) => t.groupId);

  if (isGroupPurchase) {
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
    return;
  }

  const buyer = await User.findById(tickets[0].buyer);
  if (!buyer) return;
  sendTicketConfirmationEmail(buyer.email, {
    event,
    ticketTypeName: tickets[0].ticketTypeName,
    quantity: tickets[0].quantity,
    totalPaid: tickets.reduce((s, x) => s + (x.totalPaid || 0), 0),
    code: tickets[0].code,
  }).catch((err) => console.error('Falha ao enviar email de confirmação:', err.message));
}
