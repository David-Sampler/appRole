import { escapeHtml } from './layout.js';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function ticketViewPage(ticket, event, qrDataUrl) {
  const header = `
    <h2 style="margin-top:0;">${escapeHtml(ticket.eventTitle)}</h2>
    ${event ? `<p class="muted">${formatDate(event.date)} às ${escapeHtml(event.time)} · ${escapeHtml(event.location)}</p>` : ''}
  `;
  const footer = `<p class="muted">${ticket.quantity}x ${escapeHtml(ticket.ticketTypeName)} — R$ ${ticket.totalPaid.toFixed(2)}</p>`;

  if (ticket.status === 'pending_payment') {
    return `
      <div class="card" style="text-align:center;">
        ${header}
        <p class="muted">⏳ Aguardando confirmação do pagamento</p>
        <p class="code">${escapeHtml(ticket.code)}</p>
        <p class="muted">O QR code aparece aqui assim que o pagamento for aprovado.</p>
        ${footer}
      </div>
      <script>setTimeout(() => window.location.reload(), 4000);</script>
    `;
  }

  if (ticket.status === 'cancelled') {
    return `
      <div class="card" style="text-align:center;">
        ${header}
        <p class="error">❌ Este ingresso foi cancelado</p>
        ${footer}
      </div>
    `;
  }

  const statusBadge = ticket.checkedInAt
    ? `<p class="success" style="text-align:center;">✅ Ingresso já validado na entrada</p>`
    : `<p class="muted" style="text-align:center;">Apresente este QR code na entrada do evento</p>`;

  return `
    <div class="card">
      ${header}
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="QR code do ingresso" width="220" height="220" />
      </div>
      <p class="code">${escapeHtml(ticket.code)}</p>
      ${statusBadge}
      ${footer}
    </div>
  `;
}
