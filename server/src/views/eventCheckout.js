import { escapeHtml } from './layout.js';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function eventCheckoutPage(event, groups = []) {
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

  const groupsSection = groups.length === 0 ? '' : `
    <div class="card" style="margin-top:16px;">
      <h3 style="margin-top:0;">Mesas</h3>
      <div id="groups-list">
        ${groups
          .map(
            (g) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #F0F0F0;">
            <div>
              <div style="font-weight:700;">${escapeHtml(g.name)}</div>
              <div class="muted">${g.size} ${g.size === 1 ? 'pessoa' : 'pessoas'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700; color:#059669;">R$ ${g.price.toFixed(2)}</div>
              <button
                type="button"
                class="group-buy-btn"
                data-group-id="${g._id}"
                data-size="${g.size}"
                data-name="${escapeHtml(g.name)}"
                style="width:auto; padding:8px 16px; margin-top:6px; font-size:13px;"
              >Comprar</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      <div id="group-form-wrapper" style="display:none; margin-top:16px;">
        <h4 id="group-form-title" style="margin-bottom:0;"></h4>
        <label>Seu nome</label>
        <input id="group-buyer-name" required placeholder="Nome completo" />
        <label>Seu email</label>
        <input id="group-buyer-email" type="email" required placeholder="voce@email.com" />
        <div id="attendee-fields"></div>
        <button type="button" id="group-submit-btn">Comprar mesa</button>
        <p id="group-feedback"></p>
      </div>
    </div>
  `;

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

    ${groupsSection}

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

      var selectedGroupId = null;
      var groupButtons = document.querySelectorAll('.group-buy-btn');
      for (var i = 0; i < groupButtons.length; i++) {
        groupButtons[i].addEventListener('click', function (e) {
          selectedGroupId = e.currentTarget.getAttribute('data-group-id');
          var size = parseInt(e.currentTarget.getAttribute('data-size'), 10);
          var name = e.currentTarget.getAttribute('data-name');

          document.getElementById('group-form-title').textContent = 'Comprar: ' + name;

          var fieldsDiv = document.getElementById('attendee-fields');
          fieldsDiv.innerHTML = '';
          for (var p = 0; p < size; p++) {
            var nameLabel = document.createElement('label');
            nameLabel.textContent = 'Pessoa ' + (p + 1) + ' — nome';
            var nameInput = document.createElement('input');
            nameInput.className = 'attendee-name';
            nameInput.placeholder = 'Nome completo';

            var emailLabel = document.createElement('label');
            emailLabel.textContent = 'Pessoa ' + (p + 1) + ' — email (opcional)';
            var emailInput = document.createElement('input');
            emailInput.className = 'attendee-email';
            emailInput.type = 'email';
            emailInput.placeholder = 'email@exemplo.com';

            fieldsDiv.appendChild(nameLabel);
            fieldsDiv.appendChild(nameInput);
            fieldsDiv.appendChild(emailLabel);
            fieldsDiv.appendChild(emailInput);
          }

          var wrapper = document.getElementById('group-form-wrapper');
          wrapper.style.display = 'block';
          wrapper.scrollIntoView({ behavior: 'smooth' });
        });
      }

      var groupSubmitBtn = document.getElementById('group-submit-btn');
      if (groupSubmitBtn) {
        groupSubmitBtn.addEventListener('click', async function () {
          var groupFeedback = document.getElementById('group-feedback');
          groupFeedback.textContent = '';
          groupFeedback.className = '';

          var buyerName = document.getElementById('group-buyer-name').value;
          var buyerEmail = document.getElementById('group-buyer-email').value;
          var nameInputs = document.querySelectorAll('.attendee-name');
          var emailInputs = document.querySelectorAll('.attendee-email');

          var attendees = [];
          var missingName = false;
          for (var i = 0; i < nameInputs.length; i++) {
            var n = nameInputs[i].value.trim();
            if (!n) missingName = true;
            attendees.push({ name: n, email: emailInputs[i].value.trim() || undefined });
          }

          if (!buyerName || !buyerEmail || missingName) {
            groupFeedback.textContent = 'Preencha seu nome, email e o nome de cada pessoa da mesa.';
            groupFeedback.className = 'error';
            return;
          }

          groupSubmitBtn.disabled = true;
          groupSubmitBtn.textContent = 'Processando...';

          try {
            const res = await fetch('/api/groups/' + selectedGroupId + '/guest-purchase', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: buyerName, email: buyerEmail, attendees: attendees }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Não foi possível comprar.');

            window.location.href = data.checkoutUrl;
          } catch (err) {
            groupFeedback.textContent = err.message;
            groupFeedback.className = 'error';
            groupSubmitBtn.disabled = false;
            groupSubmitBtn.textContent = 'Comprar mesa';
          }
        });
      }
    </script>
  `;
}
