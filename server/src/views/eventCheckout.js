import { escapeHtml } from './layout.js';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function eventCheckoutPage(event) {
  const ticketOptions = event.ticketTypes
    .map((tt) => {
      const left = tt.quantityAvailable - tt.quantitySold;
      const disabled = left <= 0 ? 'disabled' : '';
      const label = left <= 0
        ? `${escapeHtml(tt.name)} — esgotado`
        : `${escapeHtml(tt.name)} — R$ ${tt.price.toFixed(2)} (${left} disponíveis)`;
      return `<option value="${tt._id}" data-price="${tt.price}" data-left="${left}" ${disabled}>${label}</option>`;
    })
    .join('');

  return `
    <img class="event-image" src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.title)}" />
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(event.title)}</h2>
      <p class="muted">${formatDate(event.date)} às ${escapeHtml(event.time)} · ${escapeHtml(event.location)}</p>
      <p>${escapeHtml(event.description)}</p>

      <form id="buy-form">
        <label>Seu nome</label>
        <input id="name" required placeholder="Nome completo" />

        <label>Seu email</label>
        <input id="email" type="email" required placeholder="voce@email.com" />

        <label>Tipo de ingresso</label>
        <select id="ticketType" required>${ticketOptions}</select>

        <label>Quantidade</label>
        <input id="quantity" type="number" min="1" value="1" required />

        <button type="submit" id="submit-btn">Comprar</button>
        <p id="feedback"></p>
      </form>
    </div>

    <script>
      const form = document.getElementById('buy-form');
      const feedback = document.getElementById('feedback');
      const submitBtn = document.getElementById('submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedback.textContent = '';
        feedback.className = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processando...';

        const ticketTypeId = document.getElementById('ticketType').value;
        const quantity = parseInt(document.getElementById('quantity').value, 10);

        try {
          const res = await fetch('/api/events/${event._id}/guest-purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: document.getElementById('name').value,
              email: document.getElementById('email').value,
              ticketTypeId,
              quantity,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Não foi possível comprar.');

          window.location.href = data.checkoutUrl;
        } catch (err) {
          feedback.textContent = err.message;
          feedback.className = 'error';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Comprar';
        }
      });
    </script>
  `;
}
