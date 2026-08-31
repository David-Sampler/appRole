import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { toPublicUser } from '../utils/serialize.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const googleClient = new OAuth2Client();

export async function register(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'Preencha nome, email, senha e perfil.' });
  }
  if (!['organizer', 'buyer'].includes(role)) {
    return res.status(400).json({ message: 'Perfil inválido.' });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: 'Já existe uma conta com este email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role });
  const token = signToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Informe email e senha.' });
  }
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: 'Email ou senha inválidos.' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Email ou senha inválidos.' });
  }
  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}

export async function googleAuth(req, res) {
  const { idToken, role } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken ausente.' });
  if (googleClientIds.length === 0) {
    return res.status(500).json({ message: 'Login com Google não configurado no servidor.' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientIds });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'Token do Google inválido.' });
  }

  const email = payload.email?.toLowerCase();
  if (!email) return res.status(401).json({ message: 'Não foi possível obter o email do Google.' });

  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

  if (!user) {
    if (!role || !['organizer', 'buyer'].includes(role)) {
      return res.status(400).json({ message: 'Selecione um perfil para concluir o cadastro.' });
    }
    user = await User.create({
      name: payload.name || email,
      email,
      googleId: payload.sub,
      role,
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }

  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req, res) {
  res.json({ user: toPublicUser(req.user) });
}

export async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Informe o email.' });

  const user = await User.findOne({ email: email.toLowerCase() });
  const genericResponse = {
    message: 'Se existir uma conta com este email, enviamos um código de redefinição.',
  };

  if (!user) {
    return res.json(genericResponse);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  user.resetCode = code;
  user.resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  await user.save();

  try {
    await sendPasswordResetEmail(user.email, code);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Não foi possível enviar o email.' });
  }

  res.json(genericResponse);
}

export async function resetPassword(req, res) {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: 'Preencha email, código e nova senha.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (
    !user ||
    !user.resetCode ||
    user.resetCode !== code ||
    !user.resetCodeExpiresAt ||
    user.resetCodeExpiresAt.getTime() < Date.now()
  ) {
    return res.status(400).json({ message: 'Código inválido ou expirado.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetCode = undefined;
  user.resetCodeExpiresAt = undefined;
  await user.save();

  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}
