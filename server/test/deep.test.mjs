// Bateria profunda da API: concorrência, teste por modelo com invariantes, matriz de permissões,
// fuzzing, casos de borda e carga. O servidor roda neste processo com Mercado Pago e emails simulados.
//
// Precisa de um MongoDB em modo replica set (as compras usam transações). Ex.:
//   mongod --replSet rs0 --port 27018 --dbpath /tmp/role-test-db
//   mongosh --port 27018 --eval 'rs.initiate()'
// Rodar (em server/):  npm test
// Variáveis: TEST_MONGODB_URI, DEEP_SEED (semente do teste por modelo), DEEP_ROUNDS.
import { test, mock, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const SRC_URL = new URL('../src/', import.meta.url);
const fileUrl = (p) => new URL(p, SRC_URL).href;
const TEST_MONGO = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=rs0';
const withDb = (name) => TEST_MONGO.replace(/\/(\?|$)/, `/${name}$1`);
process.env.JWT_SECRET ||= 'segredo-de-teste-com-tamanho-suficiente-para-hs256';
const PORT = 4300;
Object.assign(process.env, {
  PORT: String(PORT),
  MONGODB_URI: withDb('role_deep_test'),
  RESEND_API_KEY: '',
  RATE_LIMIT_SCALE: '10000',
  TRUST_PROXY_HOPS: '0',
});

// ---------- Mercado Pago e emails simulados ----------
const payments = new Map();
const preferences = [];
const refunds = [];
const emails = { confirmations: [], verify: new Map(), reset: new Map() };
mock.module(fileUrl('utils/mercadopago.js'), {
  exports: {
    isPaymentsConfigured: () => true,
    isMarketplaceConfigured: () => true,
    getOAuthAuthorizationUrl: () => 'https://mp.local/oauth',
    exchangeOAuthCode: async () => ({ user_id: 1, access_token: 'a', refresh_token: 'r' }),
    createPaymentPreference: async (args) => {
      if (!(args.unitPrice > 0)) throw new Error('unit_price must be positive'); // como o MP real
      preferences.push(args);
      return { preferenceId: `pref_${preferences.length}`, checkoutUrl: 'https://mp.local/checkout' };
    },
    getPayment: async (id) => {
      if (!payments.has(String(id))) throw new Error('not found');
      return payments.get(String(id));
    },
    refundPayment: async (id) => { refunds.push(String(id)); },
  },
});
mock.module(fileUrl('utils/mailer.js'), {
  exports: {
    sendTicketConfirmationEmail: async (to, info) => { emails.confirmations.push({ to, code: info.code }); },
    sendVerificationEmail: async (to, code) => { emails.verify.set(to, code); },
    sendPasswordResetEmail: async (to, code) => { emails.reset.set(to, code); },
  },
});

await import(fileUrl('server.js'));
const require = createRequire(new URL('../package.json', import.meta.url));
const mongoose = require('mongoose');
const Event = (await import(fileUrl('models/Event.js'))).default;
const Ticket = (await import(fileUrl('models/Ticket.js'))).default;
const Group = (await import(fileUrl('models/Group.js'))).default;
const User = (await import(fileUrl('models/User.js'))).default;
const { expireStaleReservations } = await import(fileUrl('utils/reservationSweeper.js'));

const BASE = `http://localhost:${PORT}`;
const API = `${BASE}/api`;
async function call(method, path, body, token, rawBody) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// gerador pseudoaleatório com semente (resultado reproduzível)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}${n++}`;

async function registerUser(role, prefix = role) {
  const email = `${prefix}_${uniq()}@deep.local`;
  const r = await call('POST', '/auth/register', { name: `${prefix} ${n}`, email, password: 'senha123', role });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let token = r.data.token;
  if (role === 'organizer') {
    const v = await call('POST', '/auth/verify-email', { code: emails.verify.get(email.toLowerCase()) }, token);
    assert.equal(v.status, 200);
    await User.updateOne({ email }, { $set: { mpAccessToken: 'TEST-seller', mpUserId: '555' } });
  }
  return { token, email, id: r.data.user.id };
}

async function createEvent(orgToken, ticketTypes = [{ name: 'Pista', price: 50, quantityAvailable: 10 }], extra = {}) {
  const r = await call('POST', '/events', {
    title: 'Evento', description: 'd', category: 'Festa', date: '2026-12-31', time: '22:00',
    location: 'Clube', city: 'Recife', ticketTypes, ...extra,
  }, orgToken);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.event;
}

let paymentSeq = 1;
async function notifyPayment(reservationTicket, status, overrides = {}) {
  const ticketsInRes = reservationTicket.reservationId
    ? await Ticket.find({ reservationId: reservationTicket.reservationId })
    : [await Ticket.findById(reservationTicket._id)];
  const amount = ticketsInRes.reduce((s, t) => s + t.totalPaid, 0);
  const id = String(overrides.id ?? paymentSeq++);
  payments.set(id, {
    id, status, external_reference: String(reservationTicket._id), transaction_amount: amount,
    currency_id: 'BRL', collector_id: 555, ...overrides,
  });
  return call('POST', '/payments/webhook', { type: 'payment', data: { id } });
}

// ---------- invariantes: regras que nunca podem ser quebradas ----------
async function checkInvariants(where) {
  const problems = [];
  for (const ev of await Event.find()) {
    for (const tt of ev.ticketTypes) {
      const [agg] = await Ticket.aggregate([
        { $match: { ticketTypeId: tt._id, status: { $in: ['pending_payment', 'paid'] } } },
        { $group: { _id: null, q: { $sum: '$quantity' } } },
      ]);
      const active = agg?.q ?? 0;
      if (tt.quantitySold !== active) problems.push(`${ev.title}/${tt.name}: quantitySold=${tt.quantitySold} mas ingressos ativos=${active}`);
      if (tt.quantitySold > tt.quantityAvailable) problems.push(`${ev.title}/${tt.name}: vendeu ${tt.quantitySold} de ${tt.quantityAvailable} (OVERSELL)`);
    }
    // ingressos que apontam para um tipo que não existe mais
    const typeIds = ev.ticketTypes.map((t) => t._id);
    const orphans = await Ticket.countDocuments({ event: ev._id, groupId: null, ticketTypeId: { $nin: typeIds }, status: { $in: ['pending_payment', 'paid'] } });
    if (orphans) problems.push(`${ev.title}: ${orphans} ingresso(s) ativo(s) de tipo removido`);
  }
  for (const g of await Group.find()) {
    const active = await Ticket.countDocuments({ groupId: g._id, status: { $in: ['pending_payment', 'paid'] } });
    if (g.status === 'sold' && active !== g.size) problems.push(`mesa ${g.name}: vendida com ${active} ingressos ativos (esperado ${g.size})`);
    if (g.status === 'available' && (active !== 0 || g.seatsLeft !== g.size)) problems.push(`mesa ${g.name}: disponível mas com ${active} ativos / seatsLeft ${g.seatsLeft}`);
  }
  const badCheckin = await Ticket.countDocuments({ checkedInAt: { $ne: null }, status: { $ne: 'paid' } });
  if (badCheckin) problems.push(`${badCheckin} ingresso(s) validado(s) sem estar pago`);
  const dupCodes = await Ticket.aggregate([{ $group: { _id: '$code', c: { $sum: 1 } } }, { $match: { c: { $gt: 1 } } }]);
  if (dupCodes.length) problems.push(`${dupCodes.length} código(s) de ingresso duplicado(s)`);
  if (problems.length) assert.fail(`Invariantes quebradas ${where}:\n  - ${problems.join('\n  - ')}`);
}

before(async () => {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await mongoose.connection.dropDatabase();
});
after(() => mongoose.disconnect());

// =====================================================================
describe('1. Concorrência', () => {
  test('30 compradores disputando 10 ingressos ao mesmo tempo → exatamente 10 vendidos', async () => {
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token, [{ name: 'Pista', price: 50, quantityAvailable: 10 }]);
    const buyers = await Promise.all(Array.from({ length: 30 }, () => registerUser('buyer')));
    const results = await Promise.all(buyers.map((b) => call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, b.token)));
    const ok = results.filter((r) => r.status === 201).length;
    const codes = results.map((r) => r.status).reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {});
    assert.equal(ok, 10, `status: ${JSON.stringify(codes)}`);
    assert.ok(!results.some((r) => r.status >= 500), `erros 500: ${JSON.stringify(codes)}`);
    await checkInvariants('após corrida de compras');
  });

  test('15 pessoas tentando a mesma mesa ao mesmo tempo → só 1 consegue', async () => {
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token);
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: 'Mesa VIP', size: 4, price: 400 }, org.token)).data.group;
    const attendees = [1, 2, 3, 4].map((i) => ({ name: `P${i}` }));
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) =>
      call('POST', `/groups/${g.id}/guest-purchase`, { name: `G${i}`, email: `g${i}_${uniq()}@deep.local`, attendees })));
    const ok = results.filter((r) => r.status === 201).length;
    assert.equal(ok, 1, JSON.stringify(results.map((r) => r.status)));
    assert.ok(!results.some((r) => r.status >= 500), JSON.stringify(results.map((r) => r.status)));
    await checkInvariants('após corrida pela mesa');
  });

  test('mesmo aviso de pagamento chegando 6 vezes ao mesmo tempo → pago uma vez, 1 email', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const r = await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 2 }, buyer.token);
    const t = await Ticket.findById(r.data.ticket.id);
    const id = String(paymentSeq++);
    payments.set(id, { id, status: 'approved', external_reference: String(t._id), transaction_amount: 100, currency_id: 'BRL', collector_id: 555 });
    const before = emails.confirmations.length;
    await Promise.all(Array.from({ length: 6 }, () => call('POST', '/payments/webhook', { type: 'payment', data: { id } })));
    await new Promise((res) => setTimeout(res, 100));
    assert.equal((await Ticket.findById(t._id)).status, 'paid');
    assert.equal(emails.confirmations.length - before, 1, 'emails de confirmação enviados');
    await checkInvariants('após webhooks duplicados');
  });

  test('pagamento atrasado (reserva expirada) notificado 6 vezes ao mesmo tempo → estoque conta 1 vez', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const r = await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 3 }, buyer.token);
    await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(r.data.ticket.id) }, { $set: { createdAt: new Date(Date.now() - 3600e3) } });
    await expireStaleReservations();
    const id = String(paymentSeq++);
    payments.set(id, { id, status: 'approved', external_reference: r.data.ticket.id, transaction_amount: 150, currency_id: 'BRL', collector_id: 555 });
    await Promise.all(Array.from({ length: 6 }, () => call('POST', '/payments/webhook', { type: 'payment', data: { id } })));
    await checkInvariants('após pagamentos atrasados duplicados');
  });

  test('expiração rodando ao mesmo tempo que o pagamento aprovado', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    for (let i = 0; i < 8; i++) {
      const r = await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyer.token);
      const t = await Ticket.findById(r.data.ticket.id);
      await Ticket.collection.updateOne({ _id: t._id }, { $set: { createdAt: new Date(Date.now() - 3600e3) } });
      await Promise.all([expireStaleReservations(), notifyPayment(t, 'approved')]);
      await checkInvariants(`após corrida expiração × pagamento #${i + 1}`);
    }
  });

  test('compras e cancelamentos/expirações em paralelo não perdem atualização de estoque', async () => {
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token, [{ name: 'Pista', price: 10, quantityAvailable: 200 }]);
    const buyers = await Promise.all(Array.from({ length: 20 }, () => registerUser('buyer')));
    // metade compra, a outra metade compra e já fica com a reserva "velha"
    const first = await Promise.all(buyers.slice(0, 10).map((b) => call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 2 }, b.token)));
    await Ticket.collection.updateMany({ _id: { $in: first.map((r) => new mongoose.Types.ObjectId(r.data.ticket.id)) } }, { $set: { createdAt: new Date(Date.now() - 3600e3) } });
    await Promise.all([
      expireStaleReservations(),
      ...buyers.slice(10).map((b) => call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 3 }, b.token)),
    ]);
    await checkInvariants('após compras × expiração em paralelo');
  });
});

// =====================================================================
describe('2. Teste por modelo: 400 operações aleatórias', () => {
  test('invariantes valem depois de cada rodada (4 operações em paralelo por rodada)', async () => {
    const rand = rng(Number(process.env.DEEP_SEED || 20261120));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token, [
      { name: 'Pista', price: 40, quantityAvailable: 25 },
      { name: 'VIP', price: 120, quantityAvailable: 8 },
    ]);
    const buyers = await Promise.all(Array.from({ length: 6 }, () => registerUser('buyer')));
    const guestEmails = Array.from({ length: 5 }, (_, i) => `guest${i}_${uniq()}@deep.local`);
    for (let i = 0; i < 3; i++) await call('POST', `/groups/event/${ev.id}`, { name: `Mesa ${i}`, size: 2 + i, price: 100 * (i + 1) }, org.token);
    const types = () => Event.findById(ev.id).then((e) => e.ticketTypes);
    const log = [];

    const ops = {
      async buy() {
        const tt = pick(await types());
        const b = pick(buyers);
        return call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: String(tt._id), quantity: 1 + Math.floor(rand() * 4) }, b.token);
      },
      async guestBuy() {
        const tt = pick(await types());
        return call('POST', `/events/${ev.id}/guest-purchase`, { name: 'Visitante', email: pick(guestEmails), ticketTypeId: String(tt._id), quantity: 1 + Math.floor(rand() * 3) });
      },
      async buyMesa() {
        const g = pick(await Group.find({ event: ev.id }));
        const attendees = Array.from({ length: g.size }, (_, k) => ({ name: `P${k}` }));
        return rand() < 0.5
          ? call('POST', `/groups/${g._id}/purchase`, { attendees }, pick(buyers).token)
          : call('POST', `/groups/${g._id}/guest-purchase`, { name: 'V', email: pick(guestEmails), attendees });
      },
      async approve() {
        const t = pick(await Ticket.find({ status: 'pending_payment', groupSeatIndex: { $in: [null, 0] } }));
        return t && notifyPayment(t, 'approved');
      },
      async reject() {
        const t = pick(await Ticket.find({ status: 'pending_payment', groupSeatIndex: { $in: [null, 0] } }));
        return t && notifyPayment(t, rand() < 0.5 ? 'rejected' : 'cancelled');
      },
      async pix() {
        const t = pick(await Ticket.find({ status: 'pending_payment', paymentId: null, groupSeatIndex: { $in: [null, 0] } }));
        return t && notifyPayment(t, 'pending');
      },
      async ageAndSweep() {
        const t = pick(await Ticket.find({ status: 'pending_payment' }));
        if (t) await Ticket.collection.updateMany(t.reservationId ? { reservationId: t.reservationId } : { _id: t._id }, { $set: { createdAt: new Date(Date.now() - 3600e3) } });
        return expireStaleReservations();
      },
      async lateApprove() {
        const t = pick(await Ticket.find({ status: 'cancelled', cancelReason: { $in: ['expired', 'replaced'] }, paymentId: null, groupSeatIndex: { $in: [null, 0] } }));
        return t && notifyPayment(t, 'approved');
      },
      async cancelPaid() {
        for (const b of buyers) {
          const t = await Ticket.findOne({ buyer: b.id, status: 'paid', groupId: null, checkedInAt: null });
          if (t) return call('POST', `/tickets/${t._id}/cancel`, undefined, b.token);
        }
      },
      async checkin() {
        const t = pick(await Ticket.find({ status: { $in: ['paid', 'pending_payment', 'cancelled'] } }));
        return t && call('POST', '/tickets/checkin', { code: t.code }, org.token);
      },
      async checkinMesa() {
        const g = pick(await Group.find({ event: ev.id }));
        return call('POST', `/groups/${g.code}/checkin`, undefined, org.token);
      },
      async editStock() {
        const tts = await types();
        const body = {
          title: 'Evento', description: 'd', category: 'Festa', date: '2026-12-31', time: '22:00', location: 'Clube', city: 'Recife',
          ticketTypes: tts.map((t) => ({ id: String(t._id), name: t.name, price: t.price, quantityAvailable: Math.max(1, t.quantityAvailable + Math.floor(rand() * 7) - 3) })),
        };
        return call('PUT', `/events/${ev.id}`, body, org.token);
      },
    };
    const weights = [['buy', 5], ['guestBuy', 3], ['buyMesa', 2], ['approve', 5], ['reject', 2], ['pix', 1], ['ageAndSweep', 2], ['lateApprove', 2], ['cancelPaid', 2], ['checkin', 2], ['checkinMesa', 1], ['editStock', 1]];
    const bag = weights.flatMap(([k, w]) => Array(w).fill(k));

    const serverErrors = [];
    for (let round = 0; round < Number(process.env.DEEP_ROUNDS || 100); round++) {
      const names = Array.from({ length: 4 }, () => pick(bag));
      const results = await Promise.all(names.map((k) => ops[k]().catch((e) => ({ status: 'exception', data: e.message }))));
      results.forEach((r, i) => {
        if (r && (r.status >= 500 || r.status === 'exception')) serverErrors.push(`rodada ${round} ${names[i]} → ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
      });
      log.push(`${round}: ${names.join(', ')}`);
      try {
        await checkInvariants(`na rodada ${round} (${names.join(', ')})`);
      } catch (e) {
        e.message += `\nÚltimas rodadas:\n  ${log.slice(-4).join('\n  ')}`;
        throw e;
      }
    }
    assert.deepEqual(serverErrors, [], 'erros 500 durante as operações');
    const stats = await Ticket.aggregate([{ $group: { _id: '$status', c: { $sum: 1 } } }]);
    console.log('    estado final:', JSON.stringify(stats));
  });
});

// =====================================================================
describe('3. Matriz de permissões (quem pode o quê)', () => {
  test('cada rota protegida só aceita quem deve', async () => {
    const orgA = await registerUser('organizer', 'orgA');
    const orgB = await registerUser('organizer', 'orgB');
    const buyerA = await registerUser('buyer', 'buyerA');
    const buyerB = await registerUser('buyer', 'buyerB');
    const ev = await createEvent(orgA.token);
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: 'M', size: 2, price: 100 }, orgA.token)).data.group;
    const tk = (await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyerA.token)).data.ticket;
    await Ticket.updateOne({ _id: tk.id }, { $set: { status: 'paid' } });
    await call('PATCH', `/events/${ev.id}/cancel`, undefined, orgA.token).then(() => Event.updateOne({ _id: ev.id }, { $set: { status: 'active' } }));
    const evBody = { title: 'X', description: 'd', category: 'c', date: '2026-12-31', time: '20:00', location: 'l', city: 'c', ticketTypes: [{ id: ev.ticketTypes[0].id, name: 'Pista', price: 50, quantityAvailable: 10 }] };

    const actors = { anon: undefined, buyerA: buyerA.token, buyerB: buyerB.token, orgA: orgA.token, orgB: orgB.token };
    // [rota, quem PODE] — os demais devem receber 401/403 (ou 404 sem revelar existência)
    const routes = [
      ['GET', `/events/${ev.id}/buyers`, null, ['orgA']],
      ['PUT', `/events/${ev.id}`, evBody, ['orgA']],
      ['PATCH', `/events/${ev.id}/cancel`, null, ['orgA']],
      ['DELETE', `/events/${ev.id}`, null, ['orgA']],
      ['POST', `/groups/event/${ev.id}`, { name: 'N', size: 2, price: 10 }, ['orgA']],
      ['PUT', `/groups/${g.id}`, { name: 'M2', size: 2, price: 120 }, ['orgA']],
      ['POST', '/tickets/checkin', { code: tk.code }, ['orgA']],
      ['POST', `/groups/${g.code}/checkin`, null, ['orgA']],
      ['POST', `/tickets/${tk.id}/cancel`, null, ['buyerA']],
      ['GET', '/tickets/mine', null, ['buyerA', 'buyerB']],
      ['GET', '/events/mine', null, ['orgA', 'orgB']],
      ['GET', '/events/deleted', null, ['orgA', 'orgB']],
      ['POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, ['buyerA', 'buyerB']],
      ['GET', '/payments/mp/connect', null, ['orgA', 'orgB']],
      ['POST', '/uploads/event-image', null, ['orgA', 'orgB']],
    ];
    const violations = [];
    for (const [method, path, body, allowed] of routes) {
      for (const [who, token] of Object.entries(actors)) {
        if (allowed.includes(who)) continue; // só testamos quem NÃO pode (para não alterar estado)
        const r = await call(method, path, body ?? undefined, token);
        if (![401, 403, 404].includes(r.status)) violations.push(`${who} → ${method} ${path} = ${r.status}`);
      }
    }
    assert.deepEqual(violations, []);
    // e o dono consegue de verdade
    const own1 = await call('GET', `/events/${ev.id}/buyers`, undefined, orgA.token);
    assert.equal(own1.status, 200, `dono vendo compradores: ${JSON.stringify(own1.data)}`);
    const own2 = await call('POST', '/tickets/checkin', { code: tk.code }, orgA.token);
    assert.equal(own2.status, 200, `dono fazendo check-in: ${JSON.stringify(own2.data)}`);
  });

  test('tokens forjados, expirados, de usuário apagado ou do tipo errado são recusados', async () => {
    const jwt = require('jsonwebtoken');
    const b = await registerUser('buyer');
    const payload = JSON.parse(Buffer.from(b.token.split('.')[1], 'base64url'));
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...payload, role: 'organizer' })).toString('base64url')}.`;
    const wrongSecret = jwt.sign({ sub: payload.sub, role: 'organizer', v: 0 }, 'segredo-errado');
    const expired = jwt.sign({ sub: payload.sub, role: 'buyer', v: 0, typ: 'session', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
    const oauthState = jwt.sign({ organizerId: payload.sub, typ: 'mp_oauth' }, process.env.JWT_SECRET);
    const tampered = b.token.slice(0, -3) + (b.token.endsWith('AAA') ? 'BBB' : 'AAA');
    const ghost = await registerUser('buyer');
    await User.deleteOne({ email: ghost.email });
    for (const [name, tok] of Object.entries({ none, wrongSecret, expired, oauthState, tampered, ghost: ghost.token, lixo: 'abc.def.ghi' })) {
      const r = await call('GET', '/auth/me', undefined, tok);
      assert.equal(r.status, 401, `token "${name}" foi aceito (${r.status})`);
    }
  });
});

// =====================================================================
describe('4. Fuzzing de entradas (nada pode dar erro 500)', () => {
  test('3.000 requisições com dados malucos em todas as rotas', async () => {
    const rand = rng(42);
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: 'M', size: 2, price: 100 }, org.token)).data.group;
    const weird = [
      null, true, false, 0, -1, 1.5, 1e308, -0, NaN, '', ' ', 'a'.repeat(5000), '💥🎟️', '<script>alert(1)</script>',
      '{"$gt":""}', '../../etc/passwd', '000000000000000000000000', ev.id, ev.ticketTypes[0].id, [], [1, 2], ['a'], {}, { $gt: '' },
      { $where: '1' }, { a: { b: { c: {} } } }, 'null', '1', '-5', '99999999999', 'ABCDEFGH', g.code, '\u0000', '%00',
    ];
    const w = () => weird[Math.floor(rand() * weird.length)];
    const idW = () => encodeURIComponent(String(rand() < 0.5 ? w() : pickId()));
    const pickId = () => [ev.id, g.id, ev.ticketTypes[0].id, '000000000000000000000000', 'xyz'][Math.floor(rand() * 5)];
    const bodyOf = (keys) => Object.fromEntries(keys.filter(() => rand() < 0.85).map((k) => [k, w()]));
    const endpoints = [
      () => ['POST', '/auth/register', bodyOf(['name', 'email', 'password', 'role'])],
      () => ['POST', '/auth/login', bodyOf(['email', 'password'])],
      () => ['POST', '/auth/google', bodyOf(['idToken', 'role'])],
      () => ['POST', '/auth/forgot-password', bodyOf(['email'])],
      () => ['POST', '/auth/reset-password', bodyOf(['email', 'code', 'newPassword'])],
      () => ['PATCH', '/auth/me', bodyOf(['name', 'email', 'currentPassword', 'newPassword']), buyer.token],
      () => ['POST', '/auth/verify-email', bodyOf(['code']), org.token],
      () => ['GET', `/events?search=${idW()}&city=${idW()}&category=${idW()}`],
      () => ['GET', `/events/${idW()}`],
      () => ['POST', '/events', bodyOf(['title', 'description', 'category', 'date', 'time', 'location', 'city', 'imageUrl', 'ticketTypes']), org.token],
      () => ['POST', '/events', { title: 't', description: 'd', category: 'c', date: 'd', time: 't', location: 'l', city: 'c', ticketTypes: [bodyOf(['name', 'price', 'quantityAvailable'])] }, org.token],
      () => ['PUT', `/events/${idW()}`, bodyOf(['title', 'ticketTypes', 'city']), org.token],
      () => ['POST', `/events/${idW()}/purchase`, bodyOf(['ticketTypeId', 'quantity']), buyer.token],
      () => ['POST', `/events/${idW()}/guest-purchase`, bodyOf(['name', 'email', 'ticketTypeId', 'quantity'])],
      () => ['POST', `/groups/event/${idW()}`, bodyOf(['name', 'size', 'price']), org.token],
      () => ['PUT', `/groups/${idW()}`, bodyOf(['name', 'size', 'price']), org.token],
      () => ['POST', `/groups/${idW()}/purchase`, bodyOf(['attendees']), buyer.token],
      () => ['POST', `/groups/${idW()}/guest-purchase`, { ...bodyOf(['name', 'email']), attendees: rand() < 0.5 ? w() : [bodyOf(['name', 'email']), bodyOf(['name', 'email'])] }],
      () => ['POST', `/groups/${idW()}/checkin`, undefined, org.token],
      () => ['GET', `/groups/event/${idW()}`],
      () => ['POST', '/tickets/checkin', bodyOf(['code']), org.token],
      () => ['GET', `/tickets/by-code/${idW()}`],
      () => ['POST', `/tickets/${idW()}/claim`, bodyOf(['name', 'email'])],
      () => ['POST', `/tickets/${idW()}/cancel`, undefined, buyer.token],
      () => ['POST', '/payments/webhook', { type: w(), data: { id: w() } }],
      () => ['DELETE', `/events/${idW()}/purge`, undefined, org.token],
    ];
    const failures = new Map();
    for (let i = 0; i < 3000; i++) {
      const [method, path, body, token] = endpoints[Math.floor(rand() * endpoints.length)]();
      const r = await call(method, path, body, token);
      if (r.status >= 500 && r.status !== 503) { // 503 = recurso não configurado neste ambiente
        const key = `${method} ${path.split('?')[0].replace(/\/[^/]{6,}(?=\/|$)/g, '/:x')} → ${r.status} ${String(JSON.stringify(r.data)).slice(0, 80)}`;
        failures.set(key, (failures.get(key) || 0) + 1);
        if (!failures.has(key + '#ex')) failures.set(key + '#ex', String(JSON.stringify(body)).slice(0, 160));
      }
    }
    // corpo que não é JSON válido
    for (const raw of ['{', 'nul', '[1,', '"x"', '1e999999', '{"a":' + '['.repeat(5000)]) {
      const r = await call('POST', '/auth/login', undefined, undefined, raw);
      if (r.status >= 500) failures.set(`JSON inválido ${raw.slice(0, 10)} → ${r.status}`, 1);
    }
    assert.equal([...failures.keys()].filter((k) => !k.endsWith('#ex')).length, 0, `Erros 500:\n  ${[...failures.entries()].map(([k, v]) => `${k}: ${v}`).join('\n  ')}`);
    await checkInvariants('após fuzzing');
  });
});

// =====================================================================
describe('5. Casos de borda e regras de negócio', () => {
  test('XSS: textos maliciosos aparecem escapados nas páginas públicas', async () => {
    const org = await registerUser('organizer');
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>"\'';
    const ev = await createEvent(org.token, [{ name: evil, price: 10, quantityAvailable: 5 }], { title: evil, description: evil, location: evil, city: evil, imageUrl: `javascript:alert(3)" onerror="alert(4)` });
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: evil, size: 1, price: 10 }, org.token)).data.group;
    const r = await call('POST', `/groups/${g.id}/guest-purchase`, { name: evil, email: `x_${uniq()}@deep.local`, attendees: [{ name: evil }] });
    const t = await Ticket.findById(r.data.ticket.id);
    await Ticket.updateOne({ _id: t._id }, { $set: { status: 'paid' } });
    for (const url of [`${BASE}/e/${ev.id}`, `${BASE}/t/${t.code}`]) {
      const html = await (await fetch(url)).text();
      assert.ok(!html.includes('<script>alert(2)'), `${url}: <script> sem escape`);
      assert.ok(!html.includes('<img src=x onerror'), `${url}: <img onerror> sem escape`);
      assert.ok(!/src="javascript:alert\(3\)" onerror/.test(html), `${url}: atributo quebrado`);
    }
  });

  test('evento com ingresso grátis (preço 0) consegue ser "comprado"', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token, [{ name: 'Gratuito', price: 0, quantityAvailable: 50 }]);
    const r = await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyer.token);
    assert.ok(r.status < 300, `ingresso grátis: ${r.status} ${r.data?.message}`);
  });

  test('editar evento removendo um tipo de ingresso que já tem vendas', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token, [{ name: 'Pista', price: 10, quantityAvailable: 5 }, { name: 'VIP', price: 50, quantityAvailable: 5 }]);
    await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[1].id, quantity: 2 }, buyer.token);
    const r = await call('PUT', `/events/${ev.id}`, { title: 'E', description: 'd', category: 'c', date: '2026-12-31', time: '20:00', location: 'l', city: 'c', ticketTypes: [{ id: ev.ticketTypes[0].id, name: 'Pista', price: 10, quantityAvailable: 5 }] }, org.token);
    assert.equal(r.status, 400, `remover tipo com vendas foi aceito (${r.status}) — ingressos ficam órfãos`);
  });

  test('mesa: preço que não divide exato (R$100 / 3) não cobra a mais nem a menos', async () => {
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token);
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: 'M', size: 3, price: 100 }, org.token)).data.group;
    const before = preferences.length;
    const r = await call('POST', `/groups/${g.id}/guest-purchase`, { name: 'V', email: `v_${uniq()}@deep.local`, attendees: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
    assert.equal(r.status, 201);
    const pref = preferences[before];
    const charged = Math.round(pref.unitPrice * pref.quantity * 100) / 100;
    assert.equal(charged, 100, `cobrado R$ ${charged}`);
    const t = await Ticket.findById(r.data.ticket.id);
    const res = await notifyPayment(t, 'approved', { transaction_amount: 100 });
    assert.equal(res.data, 'ok', 'pagamento exato de R$100 foi recusado pela conferência de valor');
    assert.equal(await Ticket.countDocuments({ groupId: g.id, status: 'paid' }), 3);
  });

  test('cancelar evento não deixa reservas e mesas presas', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyer.token);
    const r = await call('PATCH', `/events/${ev.id}/cancel`, undefined, org.token);
    assert.equal(r.status, 200);
    const stillPending = await Ticket.countDocuments({ event: ev.id, status: 'pending_payment' });
    // informativo: a reserva pendente continua até expirar (30 min) — o pagamento ainda pode ser aprovado
    console.log(`    reservas pendentes após cancelar o evento: ${stillPending}`);
  });

  test('apagar definitivamente evento com ingressos PAGOS', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const tk = (await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyer.token)).data.ticket;
    await notifyPayment(await Ticket.findById(tk.id), 'approved');
    await call('DELETE', `/events/${ev.id}`, undefined, org.token);
    const r = await call('DELETE', `/events/${ev.id}/purge`, undefined, org.token);
    const survived = await Ticket.countDocuments({ _id: tk.id });
    assert.ok(r.status !== 204 || survived === 1, 'evento com ingresso pago foi apagado junto com o ingresso, sem reembolso');
  });

  test('ingresso de evento cancelado não passa no check-in', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const tk = (await call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, buyer.token)).data.ticket;
    await notifyPayment(await Ticket.findById(tk.id), 'approved');
    await call('PATCH', `/events/${ev.id}/cancel`, undefined, org.token);
    const r = await call('POST', '/tickets/checkin', { code: tk.code }, org.token);
    console.log(`    check-in em evento cancelado: ${r.status} ${r.data?.message}`);
  });

  test('datas e horários inválidos no evento', async () => {
    const org = await registerUser('organizer');
    const r = await call('POST', '/events', { title: 't', description: 'd', category: 'c', date: 'ontem', time: '99:99', location: 'l', city: 'c', ticketTypes: [{ name: 'P', price: 1, quantityAvailable: 1 }] }, org.token);
    console.log(`    evento com data "ontem" e hora "99:99": ${r.status}`);
    if (r.status === 201) {
      const page = await (await fetch(`${BASE}/e/${r.data.event.id}`)).text();
      assert.ok(!page.includes('Invalid Date'), 'página pública mostra "Invalid Date"');
    }
  });

  test('o 1º lugar da mesa não pode ser cancelado/reembolsado sozinho via API', async () => {
    const org = await registerUser('organizer');
    const buyer = await registerUser('buyer');
    const ev = await createEvent(org.token);
    const g = (await call('POST', `/groups/event/${ev.id}`, { name: 'M', size: 2, price: 100 }, org.token)).data.group;
    const r = await call('POST', `/groups/${g.id}/purchase`, { attendees: [{ name: 'a' }, { name: 'b' }] }, buyer.token);
    await notifyPayment(await Ticket.findById(r.data.ticket.id), 'approved');
    const c = await call('POST', `/tickets/${r.data.ticket.id}/cancel`, undefined, buyer.token);
    assert.equal(c.status, 409);
  });
});

// =====================================================================
describe('6. Carga', () => {
  test('500 listagens simultâneas + 60 compras simultâneas: sem erros, p95 aceitável', async () => {
    const org = await registerUser('organizer');
    const ev = await createEvent(org.token, [{ name: 'Pista', price: 10, quantityAvailable: 1000 }]);
    const time = async (fn) => { const t0 = performance.now(); const r = await fn(); return { ms: performance.now() - t0, status: r.status }; };
    const reads = await Promise.all(Array.from({ length: 500 }, () => time(() => fetch(`${API}/events?city=Recife`))));
    const buyers = await Promise.all(Array.from({ length: 60 }, () => registerUser('buyer')));
    const writes = await Promise.all(buyers.map((b) => time(() => call('POST', `/events/${ev.id}/purchase`, { ticketTypeId: ev.ticketTypes[0].id, quantity: 1 }, b.token))));
    const p = (arr, q) => arr.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(arr.length * q)];
    console.log(`    listagem: p50 ${p(reads, 0.5).toFixed(0)}ms, p95 ${p(reads, 0.95).toFixed(0)}ms | compra: p50 ${p(writes, 0.5).toFixed(0)}ms, p95 ${p(writes, 0.95).toFixed(0)}ms`);
    assert.ok(reads.every((x) => x.status === 200));
    const ws = writes.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
    assert.equal(ws[201], 60, `status das compras: ${JSON.stringify(ws)}`);
    await checkInvariants('após carga');
  });
});
