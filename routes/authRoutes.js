const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/auth/validate — validate JWT and return decoded user
// Users authenticate via enPathJobsBE; this service only validates tokens.
router.get('/validate', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;
