import { Router } from 'express';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import { generateQrDataUrl } from '../utils/qrcode.js';
import { pageLayout } from '../views/layout.js';
import { eventCheckoutPage } from '../views/eventCheckout.js';
import { ticketViewPage } from '../views/ticketView.js';
import { paymentPendingPage, paymentFailurePage } from '../views/paymentStatus.js';

const router = Router();

router.get('/e/:eventId', async (req, res) => {
  const event = await Event.findById(req.params.eventId).catch(() => null);
  if (!event) {
    return res.status(404).send(pageLayout('Evento não encontrado', '<p>Este evento não existe ou foi removido.</p>'));
  }
  if (event.status === 'deleted') {
    return res.status(404).send(pageLayout('Evento não encontrado', '<p>Este evento não existe ou foi removido.</p>'));
  }
  res.send(pageLayout(event.title, eventCheckoutPage(event)));
});

router.get('/t/:code', async (req, res) => {
  const ticket = await Ticket.findOne({ code: req.params.code.trim().toUpperCase() });
  if (!ticket) {
    return res.status(404).send(pageLayout('Ingresso não encontrado', '<p>Confira se o link está correto.</p>'));
  }
  const event = await Event.findById(ticket.event);
  const qrDataUrl = ticket.status === 'paid' ? await generateQrDataUrl(ticket.code) : null;
  res.send(pageLayout('Seu ingresso', ticketViewPage(ticket, event, qrDataUrl)));
});

async function findTicketByExternalReference(req) {
  const ticketId = req.query.external_reference;
  if (!ticketId) return null;
  return Ticket.findById(ticketId).catch(() => null);
}

router.get('/payment/success', async (req, res) => {
  const ticket = await findTicketByExternalReference(req);
  if (ticket && ticket.status === 'paid') {
    return res.redirect(`/t/${ticket.code}`);
  }
  res.send(
    pageLayout(
      'Confirmando pagamento',
      paymentPendingPage({ code: ticket?.code, refresh: true })
    )
  );
});

router.get('/payment/pending', async (req, res) => {
  const ticket = await findTicketByExternalReference(req);
  if (ticket && ticket.status === 'paid') {
    return res.redirect(`/t/${ticket.code}`);
  }
  res.send(
    pageLayout(
      'Pagamento pendente',
      paymentPendingPage({ code: ticket?.code, refresh: true })
    )
  );
});

router.get('/payment/failure', async (req, res) => {
  const ticket = await findTicketByExternalReference(req);
  res.send(
    pageLayout('Pagamento não aprovado', paymentFailurePage({ eventId: ticket?.event }))
  );
});

export default router;
