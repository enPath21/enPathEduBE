const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const mongoose = require('../config/mongoose');

const EduShareCard = mongoose.model('EduShareCard', new mongoose.Schema({
  shareToken: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true },
  acceptedCount: { type: Number, default: 0 },
  totalWaypoints: { type: Number, default: 0 },
  peakAnnualRoi: { type: Number, default: 0 },
  totalEarningsImpact: { type: Number, default: 0 },
  totalInvestment: { type: Number, default: 0 },
  timePeriod: { type: String, default: '10 Years' },
  credentialTypes: [String],
  waypoints: { type: mongoose.Schema.Types.Mixed, default: [] },
  expiresAt: { type: Date },
}, { timestamps: true }));

// POST /api/edu/share/generate — create share token
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { userId, shareType, stats, waypoints, timePeriod } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const shareToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await EduShareCard.deleteMany({ userId });

    await EduShareCard.create({
      shareToken,
      userId,
      acceptedCount: stats?.acceptedCount || 0,
      totalWaypoints: stats?.totalWaypoints || 0,
      peakAnnualRoi: stats?.peakAnnualRoi || 0,
      totalEarningsImpact: stats?.totalEarningsImpact || 0,
      totalInvestment: stats?.totalInvestment || 0,
      timePeriod: timePeriod || '10 Years',
      credentialTypes: stats?.credentialTypes || [],
      waypoints: (waypoints || []).map(w => ({
        credentialName: w.credentialName,
        credentialType: w.credentialType,
        projectedYear: w.projectedYear,
        durationMonths: w.durationMonths,
        salaryImpactPct: w.salaryImpactPct,
        deliveryMode: w.deliveryMode,
      })),
      expiresAt,
    });

    res.status(201).json({
      shareToken,
      shareUrl: `https://app.enpath.ai/edu-card/${shareToken}`,
      expiresAt,
    });
  } catch (err) {
    console.error('[edu-share] generate failed:', err.message);
    res.status(500).json({ error: 'Failed to generate share card' });
  }
});

// GET /api/edu/share/:shareToken — public fetch
router.get('/:shareToken', async (req, res) => {
  try {
    const card = await EduShareCard.findOne({ shareToken: req.params.shareToken }).lean();
    if (!card) return res.status(404).json({ error: 'not_found' });
    if (new Date(card.expiresAt) < new Date()) return res.status(410).json({ error: 'expired' });
    const { userId: _u, _id, __v, ...cardData } = card;
    res.json(cardData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch share card' });
  }
});

module.exports = router;
