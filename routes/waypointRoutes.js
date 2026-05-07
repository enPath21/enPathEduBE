const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const EducationWaypoint = require('../models/educationWaypoint.model');
const authMiddleware = require('../middleware/authMiddleware');

const EIA_BASE_URL =
  process.env.EIA_URL || 'https://enpath-edu-agent-285173621267.us-central1.run.app';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
  console.error('FATAL: INTERNAL_API_KEY is not set');
  process.exit(1);
}

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

// Helper — proxy PATCH to EIA
async function patchToEIA(path, body) {
  const url = `${EIA_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
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
      status: { $nin: ['declined', 'replaced', 'undesired'] },
    }).sort({ position: 1 });
    res.json({ waypoints: waypoints.sort((a, b) => (a.position || 0) - (b.position || 0)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/education/waypoints/run/:userId — trigger EIA run
router.post('/waypoints/run/:userId', authMiddleware, async (req, res) => {
  try {
    const data = await proxyToEIA(`/api/agent/run/${req.params.userId}`, { trigger: req.body?.trigger || 'manual', credentialTypes: req.body?.credentialTypes || [] });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/edu/waypoints/:id/feedback — accept, decline (hard delete), or undesired (suggest another)
router.patch('/waypoints/:id/feedback', authMiddleware, async (req, res) => {
  try {
    const { status, feedback, userId, projectedYear } = req.body;
    if (!['accepted', 'declined', 'undesired'].includes(status)) {
      return res.status(400).json({ error: 'status must be accepted, declined, or undesired' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // 'Not a fit' (declined) → hard delete, no EIA call
    if (status === 'declined') {
      const id = req.params.id;
      await EducationWaypoint.findOneAndDelete({ $or: [{ waypointId: id }, { _id: id }] }).catch(() => EducationWaypoint.findOneAndDelete({ waypointId: id }));
      return res.json({ success: true, deleted: true });
    }

    // 'Suggest another' (undesired) → mark undesired then forward to EIA for replacement
    if (status === 'undesired') {
      const id = req.params.id;
      await EducationWaypoint.findOneAndUpdate(
        { $or: [{ waypointId: id }, { _id: id }] },
        { $set: { status: 'undesired' } }
      ).catch(() => EducationWaypoint.findOneAndUpdate({ waypointId: id }, { $set: { status: 'undesired' } }));
      const body = { action: 'decline', note: feedback, userId };
      if (projectedYear != null) body.projectedYear = projectedYear;
      const data = await patchToEIA(`/api/agent/waypoints/${req.params.id}/feedback`, body);
      return res.json(data);
    }

    // 'accepted' → forward to EIA
    const body = { action: 'accept', note: feedback, userId };
    if (projectedYear != null) body.projectedYear = projectedYear;
    const data = await patchToEIA(`/api/agent/waypoints/${req.params.id}/feedback`, body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
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
    const data = await proxyToEIA('/api/agent/waypoints/replace-with-suggestion', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/education/waypoints/insert — insert a new EIA-generated waypoint between two accepted waypoints
router.post('/waypoints/insert', authMiddleware, async (req, res) => {
  const { userId, afterPosition, credentialTypes, userNotes } = req.body;
  if (!userId || afterPosition == null) {
    return res.status(400).json({ error: 'userId and afterPosition are required' });
  }

  try {
    // 1. Fetch all accepted waypoints for this user
    const allWaypoints = await EducationWaypoint.find({
      userId,
      status: { $nin: ['declined', 'replaced', 'undesired'] },
    }).sort({ position: 1 }).lean();

    const accepted = allWaypoints.filter(w => w.status === 'accepted');

    // 2. Find prev and next neighbors
    const prevWaypoint = accepted.find(w => w.position === afterPosition) || null;
    const nextWaypoint = accepted.find(w => w.position > afterPosition) || null;

    // 3. Find completed edu items (isCompleted = true, or userEndDate before next waypoint's projectedYear)
    const completedEdu = allWaypoints.filter(w => {
      if (w.isCompleted) return true;
      if (w.userEndDate && nextWaypoint?.projectedYear) {
        const parts = w.userEndDate.split('/');
        if (parts.length === 2) {
          const endYear = parseInt(parts[1], 10);
          return endYear <= nextWaypoint.projectedYear;
        }
      }
      return false;
    }).map(w => ({
      credentialName: w.credentialName,
      institution: w.institution,
      credentialType: w.credentialType,
      projectedYear: w.projectedYear,
      userEndDate: w.userEndDate,
    }));

    // 4. Fetch CIA context — fails gracefully
    let ciaGoals = [];
    try {
      const CIA_BASE_URL = process.env.CIA_URL || 'https://enpath-cia-285173621267.us-central1.run.app';
      const idTokenRes = await fetch(
        `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(CIA_BASE_URL)}`,
        { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) }
      ).catch(() => null);
      const idToken = idTokenRes?.ok ? (await idTokenRes.text()).trim() : null;
      const ciaRes = await fetch(
        `${CIA_BASE_URL}/api/v1/context/${userId}?module=education`,
        {
          headers: {
            'x-api-key': INTERNAL_API_KEY,
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (ciaRes.ok) {
        const ciaData = await ciaRes.json();
        const eduCategories = ['education', 'certification', 'training', 'skills', 'growth'];
        ciaGoals = (ciaData.goals || []).filter(g =>
          g.status === 'active' && eduCategories.includes(g.category)
        );
      }
    } catch (ciaErr) {
      console.warn('[edu:insert] CIA fetch failed, continuing without goals:', ciaErr.message);
    }

    // 5. Call EIA insert-waypoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240000);
    let eiaData;
    try {
      const eiaRes = await fetch(`${EIA_BASE_URL}/api/agent/insert-waypoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({
          userId,
          afterPosition,
          prevWaypoint: prevWaypoint || null,
          nextWaypoint: nextWaypoint || null,
          ciaGoals,
          completedEdu,
          allAcceptedWaypoints: accepted,
          credentialTypes: credentialTypes || [],
          userNotes: userNotes || '',
        }),
        signal: controller.signal,
      });
      eiaData = await eiaRes.json();
      if (!eiaRes.ok) throw new Error(eiaData.error || `EIA returned ${eiaRes.status}`);
    } finally {
      clearTimeout(timeout);
    }

    return res.json(eiaData);
  } catch (err) {
    console.error('[edu:insert] error:', err.message);
    return res.status(err.name === 'AbortError' ? 504 : 502).json({ error: err.message || 'Insert waypoint failed' });
  }
});

// PATCH /api/edu/waypoints/:id/regenerate — mark as undesired, then proxy to EIA for replacement
router.patch('/waypoints/:id/regenerate', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { feedback, userId, poll } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Mark current waypoint as undesired (for EIA pattern learning) — only on first call, not polls
    if (!poll) {
      await EducationWaypoint.findOneAndUpdate(
        { $or: [{ waypointId: id }, { _id: id }] },
        { $set: { status: 'undesired' } }
      ).catch(() => EducationWaypoint.findOneAndUpdate({ waypointId: id }, { $set: { status: 'undesired' } }));
    }

    // Proxy to EIA regenerate-one
    const data = await proxyToEIA('/api/agent/waypoints/regenerate-one', {
      userId,
      waypointId: id,
      feedbackText: feedback || '',
    });
    res.json(data);
  } catch (err) {
    console.error('[edu:regenerate] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/education/waypoints/regenerate-one — proxy to EIA with CIA feedback
router.post('/waypoints/regenerate-one', authMiddleware, async (req, res) => {
  try {
    const data = await proxyToEIA('/api/agent/waypoints/regenerate-one', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/edu/waypoints/matches/:userId — fetch education matches from EIA
// Optional ?waypointId= to search providers for a specific waypoint
router.get('/waypoints/matches/:userId', async (req, res) => {
  try {
    const waypointId = req.query.waypointId || '';
    let url = `${EIA_BASE_URL}/api/agent/education-matches/${req.params.userId}`;
    if (waypointId) url += `?waypointId=${encodeURIComponent(waypointId)}`;
    const eiaRes = await fetch(url, {
      headers: { 'x-api-key': INTERNAL_API_KEY },
    });
    const data = await eiaRes.json();
    if (!eiaRes.ok) throw new Error(data.error || `EIA returned ${eiaRes.status}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/edu/waypoints/:id/dates — User-editable start/end dates on an education waypoint
router.patch('/waypoints/:id/dates', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { userStartDate, userEndDate, isCompleted } = req.body;

  const update = {};
  if (userStartDate !== undefined) update.userStartDate = userStartDate;
  if (userEndDate   !== undefined) update.userEndDate   = userEndDate;
  if (isCompleted   !== undefined) update.isCompleted   = isCompleted;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No date fields provided' });
  }

  try {
    const wp = await EducationWaypoint.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true },
    );
    if (!wp) return res.status(404).json({ error: 'Waypoint not found' });
    res.json({ success: true, waypoint: wp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
