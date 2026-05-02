const express = require('express');
const router = express.Router();
const EduEnrolledRecord = require('../models/EduEnrolledRecord');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/edu/matches/enrolled/:userId — returns all enrolled records for userId
router.get('/matches/enrolled/:userId', async (req, res) => {
  try {
    const records = await EduEnrolledRecord.find({ userId: req.params.userId }).lean();
    const enrolledMatches = records.map(r => ({
      matchId: r.matchId,
      credentialName: r.credentialName,
      institution: r.institution,
      url: r.url,
    }));
    res.json({ enrolledMatches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/edu/matches/:matchId/enrolled — upsert when enrolled=true, delete when enrolled=false
router.patch('/matches/:matchId/enrolled', authMiddleware, async (req, res) => {
  try {
    const { userId, credentialName, institution, url, enrolled } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (enrolled) {
      await EduEnrolledRecord.findOneAndUpdate(
        { userId, matchId: req.params.matchId },
        { userId, matchId: req.params.matchId, credentialName, institution, url, enrolledAt: new Date() },
        { upsert: true, new: true },
      );
      res.json({ success: true, enrolled: true });
    } else {
      await EduEnrolledRecord.findOneAndDelete({ userId, matchId: req.params.matchId });
      res.json({ success: true, enrolled: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
