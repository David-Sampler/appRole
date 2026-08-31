export function paymentPendingPage({ code, eventId, refresh }) {
  return `
    <div class="card" style="text-align:center;">
      <h2 style="margin-top:0;">Confirmando pagamento...</h2>
      <p class="muted">Isso pode levar alguns segundos. Não feche esta página.</p>
      <p class="muted">Se você pagou por Pix ou boleto, a confirmação pode demorar um pouco mais.</p>
      ${code ? `<p class="muted">Assim que confirmado, seu ingresso estará em: <br/><a href="/t/${code}">role.app/t/${code}</a></p>` : ''}
    </div>
    ${refresh ? `<script>setTimeout(() => window.location.reload(), 3000);</script>` : ''}
  `;
}

export function paymentFailurePage({ eventId }) {
  return `
    <div class="card" style="text-align:center;">
      <h2 style="margin-top:0;">Pagamento não aprovado</h2>
      <p class="muted">Seu pagamento foi recusado ou cancelado. Nenhum valor foi cobrado.</p>
      ${eventId ? `<a href="/e/${eventId}"><button>Tentar novamente</button></a>` : ''}
    </div>
  `;
}
