// Webhook do Mercado Pago e expiração de reservas, com o Mercado Pago simulado.
// Precisa de MongoDB em replica set (veja deep.test.mjs). Rodar (em server/): npm test
import { test, mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const SRC = new URL('../src/', import.meta.url);
const require = createRequire(new URL('../package.json', import.meta.url));
const TEST_MONGO = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=rs0';
const mongoose = require('mongoose');

const payments = new Map();
const refunds = [];
mock.module(new URL('utils/mercadopago.js', SRC).href, {
  exports: {
    getPayment: async (id) => payments.get(String(id)),
    refundPayment: async (id, token) => { refunds.push({ id, token }); },
    getOAuthAuthorizationUrl: () => '', exchangeOAuthCode: async () => ({}),
    createPaymentPreference: async () => ({ preferenceId: 'p', checkoutUrl: 'x' }),
    isPaymentsConfigured: () => true, isMarketplaceConfigured: () => true,
  },
});

const { paymentWebhook } = await import(new URL('controllers/payment.controller.js', SRC).href);
const { expireStaleReservations } = await import(new URL('utils/reservationSweeper.js', SRC).href);
const Event = (await import(new URL('models/Event.js', SRC).href)).default;
const Ticket = (await import(new URL('models/Ticket.js', SRC).href)).default;
const Group = (await import(new URL('models/Group.js', SRC).href)).default;
const User = (await import(new URL('models/User.js', SRC).href)).default;

let org, buyer, event, n = 0;
const OLD = new Date(Date.now() - 31 * 60 * 1000);
const code = () => `T${Date.now()}${n++}`;

async function webhook(paymentId, status, externalRef, extra = {}) {
  payments.set(String(paymentId), { id: paymentId, status, external_reference: String(externalRef), transaction_amount: 100000, currency_id: 'BRL', ...extra });
  let out = {};
  const res = { status(c) { out.code = c; return this; }, send(b) { out.body = b; return this; } };
  await paymentWebhook({ body: { type: 'payment', data: { id: paymentId } }, query: {} }, res);
  return out;
}
const soldCount = async () => (await Event.findById(event._id)).ticketTypes[0].quantitySold;

async function makeTicket({ quantity = 2, old = false, paymentId } = {}) {
  await Event.updateOne({ _id: event._id }, { $inc: { 'ticketTypes.0.quantitySold': quantity } });
  const t = await Ticket.create({
    event: event._id, ticketTypeId: event.ticketTypes[0]._id, buyer: buyer._id, eventTitle: 'E',
    ticketTypeName: 'Pista', quantity, totalPaid: 10 * quantity, code: code(), paymentId,
  });
  if (old) await Ticket.collection.updateOne({ _id: t._id }, { $set: { createdAt: OLD } });
  return t;
}

async function makeGroupReservation({ old = false } = {}) {
  const g = await Group.create({ event: event._id, name: 'Mesa', size: 3, seatsLeft: 0, price: 300, status: 'sold', code: code(), organizer: org._id });
  const docs = await Ticket.create([0, 1, 2].map((i) => ({
    event: event._id, buyer: buyer._id, eventTitle: 'E', ticketTypeName: 'Mesa', quantity: 1, totalPaid: 100,
    code: code(), groupId: g._id, groupSeatIndex: i, attendeeName: `P${i}`,
  })), { ordered: true });
  await Ticket.updateMany({ groupId: g._id }, { $set: { reservationId: docs[0]._id } });
  if (old) await Ticket.collection.updateMany({ groupId: g._id }, { $set: { createdAt: OLD } });
  return { group: g, reservationId: docs[0]._id };
}

before(async () => {
  await mongoose.connect(TEST_MONGO.replace(/\/(\?|$)/, '/role_webhook_test$1'));
  await mongoose.connection.dropDatabase();
  org = await User.create({ name: 'Org', email: 'o@t.local', role: 'organizer', mpAccessToken: 'SELLER_TOKEN' });
  buyer = await User.create({ name: 'B', email: 'b@t.local', role: 'buyer' });
});
after(() => mongoose.disconnect());
beforeEach(async () => {
  await Ticket.deleteMany({}); await Group.deleteMany({}); await Event.deleteMany({});
  refunds.length = 0;
  event = await Event.create({
    organizer: org._id, organizerName: 'Org', title: 'E', description: 'd', category: 'c', date: 'd', time: 't',
    location: 'l', city: 'Recife', imageUrl: 'i', ticketTypes: [{ name: 'Pista', price: 10, quantityAvailable: 5 }],
  });
});

test('expira reserva abandonada e devolve o estoque', async () => {
  const t = await makeTicket({ old: true });
  assert.equal(await soldCount(), 2);
  assert.equal(await expireStaleReservations(), 1);
  const after = await Ticket.findById(t._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.cancelReason, 'expired');
  assert.equal(await soldCount(), 0);
});

test('não expira reserva recente nem reserva com Pix/boleto pendente', async () => {
  const fresh = await makeTicket();
  const pix = await makeTicket({ old: true, paymentId: '999' });
  assert.equal(await expireStaleReservations(), 0);
  assert.equal((await Ticket.findById(fresh._id)).status, 'pending_payment');
  assert.equal((await Ticket.findById(pix._id)).status, 'pending_payment');
  assert.equal(await soldCount(), 4);
});

test('mesa abandonada volta a ficar disponível (liberada uma vez só)', async () => {
  const { group } = await makeGroupReservation({ old: true });
  assert.equal(await expireStaleReservations(), 1);
  const g = await Group.findById(group._id);
  assert.equal(g.status, 'available');
  assert.equal(g.seatsLeft, 3);
  assert.equal(await Ticket.countDocuments({ groupId: group._id, status: 'cancelled', cancelReason: 'expired' }), 3);
});

test('pagamento recusado devolve a quantidade certa (2, não 1)', async () => {
  const t = await makeTicket({ quantity: 2 });
  await webhook(1001, 'rejected', t._id);
  assert.equal(await soldCount(), 0);
  const after = await Ticket.findById(t._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.paymentId, '1001');
});

test('pagamento pendente (Pix) protege a reserva da expiração', async () => {
  const t = await makeTicket({ old: true });
  await webhook(1002, 'pending', t._id);
  assert.equal((await Ticket.findById(t._id)).paymentId, '1002');
  assert.equal(await expireStaleReservations(), 0);
  await webhook(1002, 'approved', t._id);
  assert.equal((await Ticket.findById(t._id)).status, 'paid');
});

test('pagamento aprovado normal marca como pago', async () => {
  const { reservationId } = await makeGroupReservation();
  await webhook(1003, 'approved', reservationId);
  assert.equal(await Ticket.countDocuments({ reservationId, status: 'paid' }), 3);
});

test('pagou depois de expirar, ainda tem estoque → recupera e marca pago', async () => {
  const t = await makeTicket({ old: true });
  await expireStaleReservations();
  assert.equal(await soldCount(), 0);
  const r = await webhook(1004, 'approved', t._id);
  assert.equal(r.body, 'ok');
  const after = await Ticket.findById(t._id);
  assert.equal(after.status, 'paid');
  assert.equal(after.cancelReason, undefined);
  assert.equal(await soldCount(), 2);
  assert.equal(refunds.length, 0);
});

test('pagou depois de expirar, sem estoque → reembolsa', async () => {
  const t = await makeTicket({ quantity: 2, old: true });
  await expireStaleReservations();
  await makeTicket({ quantity: 4 }); // outra pessoa comprou: sobra só 1
  const r = await webhook(1005, 'approved', t._id);
  assert.equal(r.body, 'expired reservation refunded');
  assert.deepEqual(refunds, [{ id: '1005', token: 'SELLER_TOKEN' }]);
  const after = await Ticket.findById(t._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.cancelReason, 'expired_refunded');
  assert.equal(await soldCount(), 4);
});

test('pagou mesa depois de expirar, mas a mesa foi revendida → reembolsa', async () => {
  const { group, reservationId } = await makeGroupReservation({ old: true });
  await expireStaleReservations();
  await Group.updateOne({ _id: group._id }, { $set: { status: 'sold', seatsLeft: 0 } }); // revendida
  const r = await webhook(1006, 'approved', reservationId);
  assert.equal(r.body, 'expired reservation refunded');
  assert.equal(refunds.length, 1);
});

test('pagou mesa depois de expirar e a mesa continua livre → recupera', async () => {
  const { group, reservationId } = await makeGroupReservation({ old: true });
  await expireStaleReservations();
  await webhook(1007, 'approved', reservationId);
  assert.equal(await Ticket.countDocuments({ reservationId, status: 'paid' }), 3);
  assert.equal((await Group.findById(group._id)).status, 'sold');
});

test('notificação repetida de pagamento já processado é ignorada', async () => {
  const t = await makeTicket();
  await webhook(1008, 'approved', t._id);
  const r = await webhook(1008, 'approved', t._id);
  assert.equal(r.body, 'already processed');
  assert.equal(refunds.length, 0);
});

test('pagamento com valor menor que o preço é ignorado (ingresso não vira pago)', async () => {
  const t = await makeTicket({ quantity: 2 }); // R$ 20
  const r = await webhook(2001, 'approved', t._id, { transaction_amount: 0.01 });
  assert.equal(r.body, 'payment does not match purchase');
  assert.equal((await Ticket.findById(t._id)).status, 'pending_payment');
});

test('pagamento feito para outra conta (não o organizador) é ignorado', async () => {
  await User.updateOne({ _id: org._id }, { $set: { mpUserId: '111' } });
  const t = await makeTicket();
  const r = await webhook(2002, 'approved', t._id, { transaction_amount: 20, collector_id: 999 });
  assert.equal(r.body, 'payment does not match purchase');
  assert.equal((await Ticket.findById(t._id)).status, 'pending_payment');
  const ok = await webhook(2003, 'approved', t._id, { transaction_amount: 20, collector_id: 111 });
  assert.equal(ok.body, 'ok');
  assert.equal((await Ticket.findById(t._id)).status, 'paid');
  await User.updateOne({ _id: org._id }, { $unset: { mpUserId: '' } });
});

test('recusa falsa não cancela a reserva de outra pessoa', async () => {
  const t = await makeTicket({ quantity: 2 });
  await webhook(2004, 'rejected', t._id, { transaction_amount: 0.01 });
  assert.equal((await Ticket.findById(t._id)).status, 'pending_payment');
});
