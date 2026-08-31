import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente.' });
  }
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Usuário não encontrado.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: `Apenas usuários "${role}" podem fazer isso.` });
    }
    next();
  };
}
