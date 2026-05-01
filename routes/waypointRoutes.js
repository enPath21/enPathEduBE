const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const EducationWaypoint = require('../models/educationWaypoint.model');
const authMiddleware = require('../middleware/authMiddleware');

const EIA_BASE_URL =
  process.env.EIA_URL || 'https://enpath-edu-agent-285173621267.us-central1.run.app';
const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ||
  'INTERNAL_API_KEY_REDACTED';

// Helper — proxy POST to EIA
async function proxyToEIA(path, body) {
  const url = `${EIA_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `EIA returned ${res.status}`);
  return data;
}

// GET /api/education/waypoints/:userId — fetch non-declined/replaced waypoints
router.get('/waypoints/:userId', async (req, res) => {
  try {
    const waypoints = await EducationWaypoint.find({
      userId: req.params.userId,
      status: { $nin: ['declined', 'replaced'] },
    }).sort({ position: 1 });
    res.json(waypoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/education/waypoints/run/:userId — trigger EIA run
router.post('/waypoints/run/:userId', authMiddleware, async (req, res) => {
  try {
    const data = await proxyToEIA('/run', {
      userId: req.params.userId,
      ...req.body,
    });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/education/waypoints/:id/feedback — accept or decline a waypoint
router.patch('/waypoints/:id/feedback', authMiddleware, async (req, res) => {
  try {
    const { status, feedback } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'status must be accepted or declined' });
    }

    const update = { status };
    if (feedback) update.rationale = feedback;

    const waypoint = await EducationWaypoint.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!waypoint) return res.status(404).json({ error: 'Waypoint not found' });
    res.json(waypoint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/education/waypoints/undo-replace — restore a replaced waypoint
router.post('/waypoints/undo-replace', authMiddleware, async (req, res) => {
  try {
    const { waypointId } = req.body;
    if (!waypointId) return res.status(400).json({ error: 'waypointId is required' });

    const waypoint = await EducationWaypoint.findOne({ waypointId });
    if (!waypoint) return res.status(404).json({ error: 'Waypoint not found' });
    if (waypoint.status !== 'replaced') {
      return res.status(400).json({ error: 'Waypoint is not in replaced status' });
    }

    // Remove the replacement waypoint if it exists
    if (waypoint.replacedById) {
      await EducationWaypoint.findOneAndDelete({ waypointId: waypoint.replacedById });
    }

    waypoint.status = 'pending';
    waypoint.replacedById = undefined;
    await waypoint.save();

    res.json(waypoint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/education/waypoints/replace-with-suggestion — proxy to EIA
router.post('/waypoints/replace-with-suggestion', authMiddleware, async (req, res) => {
  try {
    const data = await proxyToEIA('/replace-with-suggestion', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/education/waypoints/regenerate-one — proxy to EIA with CIA feedback
router.post('/waypoints/regenerate-one', authMiddleware, async (req, res) => {
  try {
    const data = await proxyToEIA('/regenerate-one', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
