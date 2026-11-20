import { rateLimit } from 'express-rate-limit';

const message = (text) => ({ message: text });
const minutes = (n) => n * 60 * 1000;
const base = { standardHeaders: 'draft-7', legacyHeaders: false };
// RATE_LIMIT_SCALE só para testes automatizados (ex.: 100 = limites 100x maiores). Padrão: 1.
const scale = Math.max(1, Number(process.env.RATE_LIMIT_SCALE || 1));

// Login e cadastro: barra força bruta de senha vinda de um mesmo IP.
export const loginLimiter = rateLimit({
  ...base,
  windowMs: minutes(15),
  limit: 20 * scale,
  skipSuccessfulRequests: true,
  message: message('Muitas tentativas. Aguarde alguns minutos e tente novamente.'),
});

// Pedidos de email (esqueci a senha, reenviar código): evita spam de emails.
export const emailLimiter = rateLimit({
  ...base,
  windowMs: minutes(15),
  limit: 5 * scale,
  message: message('Muitos pedidos de código. Aguarde alguns minutos e tente novamente.'),
});

// Digitar código recebido por email (redefinir senha, verificar email).
export const codeLimiter = rateLimit({
  ...base,
  windowMs: minutes(15),
  limit: 15 * scale,
  message: message('Muitas tentativas de código. Aguarde alguns minutos e tente novamente.'),
});

// Compras (reservam estoque): impede que alguém esgote um evento sem pagar.
export const purchaseLimiter = rateLimit({
  ...base,
  windowMs: minutes(60),
  limit: 15 * scale,
  message: message('Muitas tentativas de compra. Aguarde um pouco e tente novamente.'),
});
