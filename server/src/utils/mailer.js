import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';

export async function sendPasswordResetEmail(email, code) {
  if (!resend) {
    throw new Error('Envio de email não configurado no servidor.');
  }
  await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: 'Código para redefinir sua senha — Rolê',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#7C3AED;">Rolê</h2>
        <p>Use o código abaixo para redefinir sua senha. Ele expira em 15 minutos.</p>
        <p style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #111827;">${code}</p>
        <p style="color:#6B7280; font-size: 13px;">Se você não pediu essa redefinição, pode ignorar este email.</p>
      </div>
    `,
  });
}

export async function sendTicketConfirmationEmail(email, { event, ticketTypeName, quantity, totalPaid, code }) {
  if (!resend) return; // não bloqueia a compra se o email não estiver configurado
  const ticketUrl = `${publicBaseUrl}/t/${code}`;
  await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: `Seu ingresso para ${event.title} 🎟️`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#7C3AED;">Rolê</h2>
        <p>Sua compra foi confirmada!</p>
        <h3 style="margin-bottom:4px;">${event.title}</h3>
        <p style="color:#6B7280; margin-top:0;">${event.date} às ${event.time} · ${event.location}</p>
        <p><strong>${quantity}x ${ticketTypeName}</strong> — R$ ${totalPaid.toFixed(2)}</p>
        <p style="font-size: 20px; font-weight: 800; letter-spacing: 3px; color: #111827;">${code}</p>
        <p>
          <a href="${ticketUrl}" style="display:inline-block; background:#7C3AED; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:700;">
            Ver meu ingresso
          </a>
        </p>
        <p style="color:#6B7280; font-size: 13px;">Apresente o QR code do link acima na entrada do evento.</p>
      </div>
    `,
  });
}
