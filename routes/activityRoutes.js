const express = require('express');
const router = express.Router();
const AuditLog = require('../models/auditLog.model');
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyOrAuth = require('../middleware/apiKeyOrAuth');

// GET /api/activity/:userId — fetch activity logs for user
router.get('/:userId', async (req, res) => {
  try {
    const logs = await AuditLog.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activity — create an activity log entry
router.post('/', apiKeyOrAuth, async (req, res) => {
  try {
    const log = await AuditLog.create(req.body);
    res.status(201).json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/activity/:id — delete an activity log entry
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const log = await AuditLog.findByIdAndDelete(req.params.id);
    if (!log) return res.status(404).json({ error: 'Activity log not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/activity/:id/read — mark activity as read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const log = await AuditLog.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!log) return res.status(404).json({ error: 'Activity log not found' });
    res.json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
