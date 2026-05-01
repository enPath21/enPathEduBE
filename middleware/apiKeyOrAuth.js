const jwt = require('jsonwebtoken');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'JWT_SECRET_REDACTED';

const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ||
  'INTERNAL_API_KEY_REDACTED';

function apiKeyOrAuth(req, res, next) {
  // Check for internal API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === INTERNAL_API_KEY) {
    req.authMethod = 'apiKey';
    return next();
  }

  // Fall back to JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      req.authMethod = 'jwt';
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  return res.status(401).json({ error: 'Missing authentication — provide x-api-key or Bearer token' });
}

module.exports = apiKeyOrAuth;
