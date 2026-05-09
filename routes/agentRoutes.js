const express = require('express');
const router = express.Router();

router.post('/agent/recalc/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const agentUrl = process.env.EDU_AGENT_URL || 'https://enpath-edu-agent-285173621267.us-central1.run.app';
    const response = await fetch(`${agentUrl}/api/agent/recalc/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY || ''
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[edu-recalc proxy] error:', err);
    res.status(500).json({ error: 'Recalc proxy failed' });
  }
});

module.exports = router;
