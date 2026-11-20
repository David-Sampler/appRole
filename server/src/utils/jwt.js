import jwt from 'jsonwebtoken';

const ALGORITHMS = ['HS256'];

// `v` = tokenVersion do usuário: trocar a senha incrementa a versão e derruba os tokens antigos.
export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, v: user.tokenVersion ?? 0, typ: 'session' },
    process.env.JWT_SECRET,
    { expiresIn: '30d', algorithm: 'HS256' }
  );
}

export function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ALGORITHMS });
  if (payload.typ && payload.typ !== 'session') throw new Error('Tipo de token inválido.');
  return payload;
}

export function signOAuthState(organizerId) {
  return jwt.sign({ organizerId, typ: 'mp_oauth' }, process.env.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
}

export function verifyOAuthState(state) {
  const payload = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ALGORITHMS });
  if (payload.typ !== 'mp_oauth' || !payload.organizerId) throw new Error('State inválido.');
  return payload;
}
