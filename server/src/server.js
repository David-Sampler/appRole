import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rejectMongoOperators } from './utils/security.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import publicRoutes from './routes/public.routes.js';
import groupRoutes from './routes/group.routes.js';
import { startReservationSweeper } from './utils/reservationSweeper.js';

const app = express();

// Atrás do proxy do Render: usa o IP real do cliente (necessário para o limite de tentativas).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
// Query string sem objetos aninhados (?category[$ne]=x vira texto, não operador).
app.set('query parser', 'simple');

// CSP desligado: as páginas públicas (/e, /t, /payment) usam scripts inline.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(rejectMongoOperators);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use(publicRoutes);
app.use('/api/groups', groupRoutes);

app.use((err, req, res, next) => {
  // id malformado na URL (ex.: /api/events/abc) é "não encontrado", não erro do servidor
  if (err.name === 'CastError') return res.status(404).json({ message: 'Não encontrado.' });
  console.error(err);
  const status = err.name === 'MulterError' ? 400 : err.status || err.statusCode || 500;
  // erros internos não expõem detalhes do servidor para o cliente
  res.status(status).json({ message: status >= 500 ? 'Erro interno do servidor' : err.message });
});

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    startReservationSweeper();
  })
  .catch((err) => {
    console.error('Falha ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
