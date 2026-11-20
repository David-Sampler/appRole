// Corrige mesas afetadas pelo bug antigo do webhook: só o 1º ingresso da mesa virava "pago"
// e os demais ficavam em "aguardando pagamento" mesmo com o pagamento aprovado.
//
// Também lista as reservas paradas que o job de expiração vai cancelar após o deploy.
//
// Uso (a partir de server/):
//   node scripts/fix-mesa-paid-tickets.js          → só mostra o que encontrou (não altera nada)
//   node scripts/fix-mesa-paid-tickets.js --apply  → marca como pagos os ingressos travados
import 'dotenv/config';
import mongoose from 'mongoose';
import Ticket from '../src/models/Ticket.js';
import { RESERVATION_TTL_MS } from '../src/config/reservation.js';

const apply = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGODB_URI);
console.log(`Banco: ${mongoose.connection.host}/${mongoose.connection.name}`);
console.log(apply ? 'Modo: APLICAR correções\n' : 'Modo: só leitura (use --apply para corrigir)\n');

// 1) Mesas com pagamento aprovado em parte dos ingressos e o resto travado
const affected = await Ticket.aggregate([
  { $match: { groupId: { $exists: true }, reservationId: { $exists: true } } },
  {
    $group: {
      _id: '$reservationId',
      eventTitle: { $first: '$eventTitle' },
      groupName: { $first: '$groupName' },
      paymentId: { $max: { $cond: [{ $eq: ['$status', 'paid'] }, '$paymentId', null] } },
      paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ['$status', 'pending_payment'] }, 1, 0] } },
    },
  },
  { $match: { paid: { $gt: 0 }, pending: { $gt: 0 } } },
]);

console.log(`Mesas pagas com ingressos travados: ${affected.length}`);
let fixed = 0;
for (const r of affected) {
  console.log(`  - ${r.eventTitle} / ${r.groupName}: ${r.paid} pago(s), ${r.pending} travado(s), pagamento ${r.paymentId ?? '?'}`);
  if (apply) {
    const res = await Ticket.updateMany(
      { reservationId: r._id, status: 'pending_payment' },
      { $set: { status: 'paid', ...(r.paymentId ? { paymentId: r.paymentId } : {}) } }
    );
    fixed += res.modifiedCount;
  }
}
if (apply) console.log(`Ingressos corrigidos: ${fixed}`);

// 2) O que o job de expiração vai liberar no primeiro ciclo após o deploy
const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
const stale = await Ticket.aggregate([
  { $match: { status: 'pending_payment', createdAt: { $lt: cutoff }, paymentId: { $exists: false } } },
  {
    $group: {
      _id: { $ifNull: ['$reservationId', '$_id'] },
      eventTitle: { $first: '$eventTitle' },
      label: { $first: { $ifNull: ['$groupName', '$ticketTypeName'] } },
      isMesa: { $max: { $cond: [{ $ifNull: ['$groupId', false] }, 1, 0] } },
      quantity: { $sum: '$quantity' },
      createdAt: { $min: '$createdAt' },
    },
  },
  { $sort: { createdAt: 1 } },
]);
const affectedIds = new Set(affected.map((r) => String(r._id)));
const willExpire = apply ? stale.filter((s) => !affectedIds.has(String(s._id))) : stale;

console.log(`\nReservas paradas que serão liberadas após o deploy: ${willExpire.length}`);
for (const s of willExpire) {
  const tipo = s.isMesa ? 'mesa' : 'ingresso';
  const dia = s.createdAt.toISOString().slice(0, 10);
  const marca = affectedIds.has(String(s._id)) ? '  ⚠ mesa paga — rode com --apply antes do deploy' : '';
  console.log(`  - [${tipo}] ${s.eventTitle} / ${s.label} (desde ${dia})${marca}`);
}

await mongoose.disconnect();
