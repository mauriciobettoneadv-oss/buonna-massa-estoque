require('dotenv').config();
const jwt = require('jsonwebtoken');

const OWNER_ROLES = ['dono', 'proprietario'];

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user.role;
    // Owners always pass
    if (OWNER_ROLES.includes(role)) return next();
    if (allowed.includes(role)) return next();
    return res.status(403).json({ error: 'Acesso negado.' });
  };
}

module.exports = { authenticate, requireRole, OWNER_ROLES };
