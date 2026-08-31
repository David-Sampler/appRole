import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function signOAuthState(organizerId) {
  return jwt.sign({ organizerId }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

export function verifyOAuthState(state) {
  return jwt.verify(state, process.env.JWT_SECRET);
}
