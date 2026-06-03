const jwt = require('jsonwebtoken');

const ROLES = { ADMIN: 'admin', INSPECTOR: 'inspector', USER: 'user' };

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, ROLES };
