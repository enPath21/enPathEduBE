const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

const CIA_BASE_URL = process.env.CIA_URL || 'https://enpath-cia-285173621267.us-central1.run.app';
const CIA_API_KEY  = process.env.INTERNAL_API_KEY;

// Fetch GCP identity token from metadata server (Cloud Run only)
async function getGCPIdentityToken(audience) {
  try {
    const r = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) }
    );
    if (!r.ok) return null;
    return (await r.text()).trim();
  } catch { return null; }
}

async function ciaHeaders() {
  const idToken = await getGCPIdentityToken(CIA_BASE_URL);
  return {
    'Content-Type': 'application/json',
    'x-api-key': CIA_API_KEY,
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

// GET /api/edu/cia-preferences/:userId — fetch full CIA preferences
router.get('/cia-preferences/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const headers = await ciaHeaders();
    const ciaRes = await fetch(`${CIA_BASE_URL}/api/v1/preferences/${userId}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!ciaRes.ok) return res.status(ciaRes.status).json({ error: 'CIA preferences fetch failed' });
    return res.json(await ciaRes.json());
  } catch (err) {
    console.error('[edu:cia-preferences] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch CIA preferences' });
  }
});

// PATCH /api/edu/cia-preferences/:userId/goals/:goalId — update goal
router.patch('/cia-preferences/:userId/goals/:goalId', authMiddleware, async (req, res) => {
  try {
    const { userId, goalId } = req.params;
    const headers = await ciaHeaders();
    const ciaRes = await fetch(`${CIA_BASE_URL}/api/v1/preferences/${userId}/goals/${goalId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(8000),
    });
    if (!ciaRes.ok) return res.status(ciaRes.status).json({ error: 'CIA goal update failed' });
    return res.json(await ciaRes.json());
  } catch (err) {
    console.error('[edu:cia-preferences] PATCH error:', err.message);
    return res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/edu/cia-preferences/:userId/goals/:goalId — archive goal
router.delete('/cia-preferences/:userId/goals/:goalId', authMiddleware, async (req, res) => {
  try {
    const { userId, goalId } = req.params;
    const headers = await ciaHeaders();
    const ciaRes = await fetch(`${CIA_BASE_URL}/api/v1/preferences/${userId}/goals/${goalId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!ciaRes.ok) return res.status(ciaRes.status).json({ error: 'CIA goal delete failed' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[edu:cia-preferences] DELETE error:', err.message);
    return res.status(500).json({ error: 'Failed to archive goal' });
  }
});

// POST /api/edu/cia-preferences/:userId/goals — create a new goal
router.post('/cia-preferences/:userId/goals', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const headers = await ciaHeaders();
    const now = new Date().toISOString();
    const body = {
      goal_text: req.body.goal_text,
      category: req.body.category,
      status: 'active',
      intent_strength: req.body.intent_strength || 'moderate',
      qualitative_weight: req.body.qualitative_weight || 'moderate',
      confidence: req.body.confidence ?? 0.8,
      ...(req.body.metadata ? { metadata: req.body.metadata } : {}),
      source: {
        type: 'user_manual',
        agent: 'eia',
        conversation_id: 'manual',
        turn_id: 'manual',
        extracted_at: now,
      },
    };
    const ciaRes = await fetch(`${CIA_BASE_URL}/api/v1/preferences/${userId}/goals`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!ciaRes.ok) return res.status(ciaRes.status).json({ error: 'CIA goal create failed' });
    return res.json(await ciaRes.json());
  } catch (err) {
    console.error('[edu:cia-preferences] POST error:', err.message);
    return res.status(500).json({ error: 'Failed to create goal' });
  }
});

module.exports = router;
