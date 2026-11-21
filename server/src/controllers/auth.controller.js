import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { toPublicUser } from '../utils/serialize.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../utils/mailer.js';
import { randomDigits, safeEqual, isNonEmptyString, isValidEmail } from '../utils/security.js';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const VERIFY_CODE_TTL_MS = 30 * 60 * 1000;
// Depois de tantas tentativas erradas o código é descartado e é preciso pedir outro.
const MAX_CODE_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 6;

const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const googleClient = new OAuth2Client();

const normalizeEmail = (email) => email.trim().toLowerCase();

async function issueVerificationCode(user) {
  const code = randomDigits();
  user.verifyCode = code;
  user.verifyCodeExpiresAt = new Date(Date.now() + VERIFY_CODE_TTL_MS);
  user.verifyCodeAttempts = 0;
  await user.save();
  return code;
}

export async function register(req, res) {
  const { name, email, password, role } = req.body;
  if (!isNonEmptyString(name) || !isNonEmptyString(email) || typeof password !== 'string' || !role) {
    return res.status(400).json({ message: 'Preencha nome, email, senha e perfil.' });
  }
  if (!['organizer', 'buyer'].includes(role)) {
    return res.status(400).json({ message: 'Perfil inválido.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Email inválido.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }
  const existing = await User.findOne({ email: normalizeEmail(email) });
  if (existing) {
    // conta criada numa compra sem cadastro: dona do email cria a senha pelo "esqueci minha senha"
    if (!existing.passwordHash && !existing.googleId) {
      return res.status(409).json({
        message:
          'Você já comprou ingressos com este email. Use "Esqueci minha senha" para criar sua senha e acessar sua conta.',
      });
    }
    return res.status(409).json({ message: 'Já existe uma conta com este email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: name.trim(),
    email: normalizeEmail(email),
    passwordHash,
    role,
    isVerified: role === 'organizer' ? false : true,
  });

  if (role === 'organizer') {
    const code = await issueVerificationCode(user);
    try {
      await sendVerificationEmail(user.email, code);
    } catch {
      // não bloqueia o cadastro se o email de verificação falhar; o organizador pode reenviar depois
    }
  }

  const token = signToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ message: 'Informe email e senha.' });
  }
  const user = await User.findOne({ email: normalizeEmail(email) });
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
  if (!isNonEmptyString(idToken)) return res.status(400).json({ message: 'idToken ausente.' });
  if (googleClientIds.length === 0) {
    return res.status(503).json({ message: 'Login com Google não configurado no servidor.' });
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
  // sem email confirmado pelo Google, não dá para garantir que a pessoa é dona dele
  if (payload.email_verified !== true) {
    return res.status(401).json({ message: 'Confirme seu email na conta Google antes de entrar.' });
  }

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

export async function updateProfile(req, res) {
  const { name, email, currentPassword, newPassword } = req.body;
  const user = req.user;
  let emailChanged = false;
  let passwordChanged = false;

  if (name !== undefined) {
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: 'O nome não pode ficar vazio.' });
    }
    user.name = name.trim();
  }

  if (email !== undefined) {
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Email inválido.' });
    }
    if (normalizeEmail(email) !== user.email) {
      const existing = await User.findOne({ email: normalizeEmail(email) });
      if (existing) {
        return res.status(409).json({ message: 'Já existe uma conta com este email.' });
      }
      user.email = normalizeEmail(email);
      emailChanged = true;
    }
  }

  if (newPassword !== undefined) {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    }
    if (user.passwordHash) {
      if (!isNonEmptyString(currentPassword)) {
        return res.status(400).json({ message: 'Informe a senha atual para definir uma nova.' });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: 'Senha atual incorreta.' });
      }
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // derruba sessões abertas em outros aparelhos
    passwordChanged = true;
  }

  // organizador precisa confirmar o email novo antes de voltar a publicar eventos
  if (emailChanged && user.role === 'organizer') {
    user.isVerified = false;
    const code = await issueVerificationCode(user);
    sendVerificationEmail(user.email, code).catch(() => {});
  }

  await user.save();
  // quem trocou a senha recebe um token novo para continuar logado neste aparelho
  res.json({ user: toPublicUser(user), ...(passwordChanged ? { token: signToken(user) } : {}) });
}

export async function resendVerification(req, res) {
  const user = req.user;
  if (user.isVerified) {
    return res.status(409).json({ message: 'Este email já foi verificado.' });
  }

  const code = await issueVerificationCode(user);

  try {
    await sendVerificationEmail(user.email, code);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Não foi possível enviar o email.' });
  }

  res.json({ message: 'Código de verificação reenviado.' });
}

export async function verifyEmail(req, res) {
  const { code } = req.body;
  const user = req.user;

  if (user.isVerified) {
    return res.json({ user: toPublicUser(user) });
  }
  if (
    !isNonEmptyString(code) ||
    !user.verifyCode ||
    !user.verifyCodeExpiresAt ||
    user.verifyCodeExpiresAt.getTime() < Date.now()
  ) {
    return res.status(400).json({ message: 'Código inválido ou expirado.' });
  }
  if (!safeEqual(user.verifyCode, code.trim())) {
    user.verifyCodeAttempts = (user.verifyCodeAttempts ?? 0) + 1;
    if (user.verifyCodeAttempts >= MAX_CODE_ATTEMPTS) {
      user.verifyCode = undefined;
      user.verifyCodeExpiresAt = undefined;
    }
    await user.save();
    return res.status(400).json({
      message:
        user.verifyCodeAttempts >= MAX_CODE_ATTEMPTS
          ? 'Muitas tentativas erradas. Peça um novo código.'
          : 'Código inválido ou expirado.',
    });
  }

  user.isVerified = true;
  user.verifyCode = undefined;
  user.verifyCodeExpiresAt = undefined;
  user.verifyCodeAttempts = 0;
  await user.save();

  res.json({ user: toPublicUser(user) });
}

export async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!isNonEmptyString(email)) return res.status(400).json({ message: 'Informe o email.' });

  const user = await User.findOne({ email: normalizeEmail(email) });
  const genericResponse = {
    message: 'Se existir uma conta com este email, enviamos um código de redefinição.',
  };

  if (!user) {
    return res.json(genericResponse);
  }

  const code = randomDigits();
  user.resetCode = code;
  user.resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  user.resetCodeAttempts = 0;
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
  if (!isNonEmptyString(email) || !isNonEmptyString(code) || typeof newPassword !== 'string') {
    return res.status(400).json({ message: 'Preencha email, código e nova senha.' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || !user.resetCode || !user.resetCodeExpiresAt || user.resetCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Código inválido ou expirado.' });
  }
  if (!safeEqual(user.resetCode, code.trim())) {
    user.resetCodeAttempts = (user.resetCodeAttempts ?? 0) + 1;
    if (user.resetCodeAttempts >= MAX_CODE_ATTEMPTS) {
      // código queimado: força bruta fica limitada a 5 chutes por código enviado
      user.resetCode = undefined;
      user.resetCodeExpiresAt = undefined;
    }
    await user.save();
    return res.status(400).json({
      message:
        user.resetCodeAttempts >= MAX_CODE_ATTEMPTS
          ? 'Muitas tentativas erradas. Peça um novo código.'
          : 'Código inválido ou expirado.',
    });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetCode = undefined;
  user.resetCodeExpiresAt = undefined;
  user.resetCodeAttempts = 0;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // quem estava logado com a senha antiga sai
  await user.save();

  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}
