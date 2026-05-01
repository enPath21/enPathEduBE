const express = require('express');
const router = express.Router();
const EducationItem = require('../models/educationItem.model');
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyOrAuth = require('../middleware/apiKeyOrAuth');

// GET /api/education/history/:userId — fetch all education items for user
router.get('/history/:userId', async (req, res) => {
  try {
    const items = await EducationItem.find({ userId: req.params.userId }).sort({ endDate: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edu/history/:userId — create education item
router.post('/history/:userId', authMiddleware, async (req, res) => {
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
    const item = await EducationItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
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

// POST /api/education/history/from-resume — bulk upsert from resume parser
router.post('/history/from-resume', apiKeyOrAuth, async (req, res) => {
  try {
    const { userId, items } = req.body;
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'userId and items[] are required' });
    }

    const results = [];
    for (const item of items) {
      const filter = { userId, institution: item.institution, degree: item.degree, field: item.field };
      const doc = await EducationItem.findOneAndUpdate(
        filter,
        { ...item, userId, source: 'resume' },
        { upsert: true, new: true, runValidators: true }
      );
      results.push(doc);
    }

    res.status(200).json({ upserted: results.length, items: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
