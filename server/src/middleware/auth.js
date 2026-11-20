import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente.' });
  }
  let user;
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Usuário não encontrado.' });
    if ((payload.v ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'Sua sessão expirou. Entre novamente.' });
    }
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
  req.user = user;
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: `Apenas usuários "${role}" podem fazer isso.` });
    }
    next();
  };
}
