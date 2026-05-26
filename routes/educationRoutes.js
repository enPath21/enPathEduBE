const express = require('express');
const router = express.Router();
const EducationItem = require('../models/educationItem.model');
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyOrAuth = require('../middleware/apiKeyOrAuth');

// POST /api/edu/history/from-resume — wipe existing edu records for user then insert fresh
// MUST be defined before POST /history/:userId to prevent Express matching "from-resume" as userId
router.post('/history/from-resume', apiKeyOrAuth, async (req, res) => {
  try {
    const { userId, items } = req.body;
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'userId and items[] are required' });
    }

    // Wipe all existing education records for this user — resume replace flow
    await EducationItem.deleteMany({ userId });

    const results = [];
    for (const item of items) {
      const doc = await EducationItem.create({ ...item, userId, source: 'resume' });
      results.push(doc);
    }

    res.status(200).json({ replaced: results.length, items: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/education/history/:userId — fetch all education items for user
router.get('/history/:userId', async (req, res) => {
  try {
    const items = await EducationItem.find({ userId: req.params.userId }).sort({ endDate: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edu/history/:userId — create education item (JWT or internal API key)
router.post('/history/:userId', apiKeyOrAuth, async (req, res) => {
  try {
    const item = await EducationItem.create({ ...req.body, userId: req.params.userId });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/education/history/:id — update education item
router.put('/history/:id', authMiddleware, async (req, res) => {
  try {
    // Strip immutable/system fields that Mongoose rejects on update
    const { _id, __v, userId, createdAt, updatedAt, ...body } = req.body;

    // Strip empty strings for enum fields — Mongoose rejects "" against a fixed enum.
    // Omitting the key entirely is safe; Mongoose leaves the existing value in place.
    const ENUM_FIELDS = ['deliveryMode', 'credentialType', 'status', 'honors', 'source'];
    for (const field of ENUM_FIELDS) {
      if (body[field] === '') delete body[field];
    }

    const item = await EducationItem.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!item) return res.status(404).json({ error: 'Education item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/education/history/:id — delete education item
router.delete('/history/:id', authMiddleware, async (req, res) => {
  try {
    const item = await EducationItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Education item not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
