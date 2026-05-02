const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware')
const EduEnrolledRecord = require('../models/EduEnrolledRecord')

// GET /api/edu/matches/enrolled/:userId
router.get('/matches/enrolled/:userId', authMiddleware, async (req, res) => {
  try {
    const records = await EduEnrolledRecord.find({ userId: req.params.userId }).lean()
    res.json({ enrolledMatches: records })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/edu/matches/:matchId/enrolled
router.patch('/matches/:matchId/enrolled', authMiddleware, async (req, res) => {
  const { userId, credentialName, institution, url, enrolled } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })
  try {
    if (enrolled) {
      await EduEnrolledRecord.findOneAndUpdate(
        { userId, matchId: req.params.matchId },
        { userId, matchId: req.params.matchId, credentialName, institution, url: url || null },
        { upsert: true, new: true }
      )
    } else {
      await EduEnrolledRecord.deleteOne({ userId, matchId: req.params.matchId })
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
