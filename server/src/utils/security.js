import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Código aleatório imprevisível (ingresso, mesa). Usa o gerador criptográfico, não Math.random.
export function randomCode(length) {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

// Código numérico de 6 dígitos para email (verificação / redefinição de senha).
export function randomDigits() {
  return String(crypto.randomInt(100000, 1000000));
}

// Comparação de códigos sem vazar tempo de resposta.
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
export const isValidEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Recusa corpo/parâmetros com chaves de operador do Mongo ($gt, $ne...).
// (Chaves com ponto são permitidas: o webhook do Mercado Pago usa ?data.id=...)
function hasOperatorKey(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$')) return true;
    if (hasOperatorKey(value[key], depth + 1)) return true;
  }
  return false;
}

export function rejectMongoOperators(req, res, next) {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query) || hasOperatorKey(req.params)) {
    return res.status(400).json({ message: 'Requisição inválida.' });
  }
  next();
}

// ---- Criptografia dos tokens do Mercado Pago salvos no banco (AES-256-GCM) ----
const ENC_PREFIX = 'enc:v1:';

function encryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64.');
  return key;
}

export function encryptSecret(plain) {
  if (!plain) return plain;
  const key = encryptionKey();
  if (!key) {
    console.warn('TOKEN_ENCRYPTION_KEY não definida: token do Mercado Pago salvo sem criptografia.');
    return plain;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ENC_PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

// Aceita tokens antigos (texto puro) para não quebrar organizadores já conectados.
export function decryptSecret(stored) {
  if (!stored || !String(stored).startsWith(ENC_PREFIX)) return stored;
  const key = encryptionKey();
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY ausente: não é possível ler o token do Mercado Pago.');
  const [iv, tag, data] = stored.slice(ENC_PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
