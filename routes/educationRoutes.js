const express = require('express');
const router = express.Router();
const EducationItem = require('../models/educationItem.model');
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyOrAuth = require('../middleware/apiKeyOrAuth');

// ── EIA enrichment wiring ──
// Calls POST /api/agent/enrich-credential (added in edu-agent cce0bfa).
// Failure mode: log + return item as-is (unenriched save is allowed).
const EIA_BASE_URL =
  process.env.EIA_URL || 'https://enpath-edu-agent-285173621267.us-central1.run.app';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Call EIA /enrich-credential for a single EducationItem doc. Returns a plain
 * object of fields to merge onto the doc. Honors user overrides:
 *   - tuitionOverride  → becomes tuitionMidpoint (min/max left as EIA's estimate)
 *   - salaryImpactPctOverride → becomes salaryImpactPct (server does not
 *     recompute salaryRoiPerYear because that requires the ROI anchor context;
 *     Deploy 3 frontend derives displayed ROI from override when present)
 * On any failure (network, non-2xx, timeout), returns {} — caller merges nothing.
 */
async function enrichEducationItem(item) {
  if (!INTERNAL_API_KEY) {
    console.warn('[enrichEducationItem] INTERNAL_API_KEY not set — skipping enrichment');
    return {};
  }
  if (!item || !item.userId || !item.credentialName) return {};

  const isHistorical = item.status !== 'planned';

  const body = {
    userId: String(item.userId),
    credentialName: item.credentialName,
    institution: item.institution || '',
    credentialType: item.credentialType || 'course',
    startDate: item.startDate ? new Date(item.startDate).toISOString() : null,
    endDate: item.endDate ? new Date(item.endDate).toISOString() : null,
    location: item.location || '',
    deliveryMode: item.deliveryMode || '',
    isHistorical,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${EIA_BASE_URL}/api/agent/enrich-credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[enrichEducationItem] EIA ${res.status} for ${item.credentialName}`);
      return {};
    }
    const data = await res.json();
    const merged = {
      durationMonths: data.durationMonths,
      tuitionMin: data.tuitionMin,
      tuitionMax: data.tuitionMax,
      tuitionMidpoint: data.tuitionMidpoint,
      salaryImpactPct: data.salaryImpactPct,
      salaryRoiPerYear: data.salaryRoiPerYear,
      enrichmentConfidence: data.confidence,
      enrichedAt: data.enrichedAt ? new Date(data.enrichedAt) : new Date(),
    };
    // Honor overrides on top of EIA output
    if (typeof item.tuitionOverride === 'number' && item.tuitionOverride >= 0) {
      merged.tuitionMidpoint = item.tuitionOverride;
    }
    if (typeof item.salaryImpactPctOverride === 'number' && item.salaryImpactPctOverride >= 0) {
      merged.salaryImpactPct = item.salaryImpactPctOverride;
    }
    return merged;
  } catch (err) {
    console.warn(`[enrichEducationItem] failed for ${item.credentialName}:`, err.message);
    return {};
  }
}

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

    // Create all docs first, then enrich in parallel and update each with
    // whatever EIA returns. Any failure is swallowed by enrichEducationItem
    // (returns {}) so from-resume never fails on enrichment problems.
    const created = [];
    for (const item of items) {
      const doc = await EducationItem.create({ ...item, userId, source: 'resume' });
      created.push(doc);
    }

    const enrichments = await Promise.all(created.map(doc => enrichEducationItem(doc)));
    const results = [];
    for (let i = 0; i < created.length; i++) {
      const patch = enrichments[i];
      if (Object.keys(patch).length > 0) {
        const updated = await EducationItem.findByIdAndUpdate(created[i]._id, patch, { new: true });
        results.push(updated || created[i]);
      } else {
        results.push(created[i]);
      }
    }

    res.status(200).json({ replaced: results.length, items: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/education/history/:userId — fetch all education items for user.
// Lazy backfill: for any item missing enrichedAt, fire-and-forget an EIA call
// that patches the doc in the background. Returns immediately with whatever is
// in Mongo now; subsequent GETs will include the enriched fields.
router.get('/history/:userId', async (req, res) => {
  try {
    const items = await EducationItem.find({ userId: req.params.userId }).sort({ endDate: -1 });

    // Fire-and-forget backfill for unenriched items
    const stale = items.filter(it => !it.enrichedAt && it.credentialName);
    if (stale.length > 0) {
      Promise.all(stale.map(async (it) => {
        try {
          const patch = await enrichEducationItem(it);
          if (Object.keys(patch).length > 0) {
            await EducationItem.findByIdAndUpdate(it._id, patch);
          }
        } catch (e) {
          // Silent — GET must not fail on backfill errors
        }
      })).catch(() => {});
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edu/history/:userId — create education item (JWT or internal API key).
// Enrich synchronously on create so the response includes financial fields.
// If enrichment fails, the item is returned as-is (Tim's decision #4).
router.post('/history/:userId', apiKeyOrAuth, async (req, res) => {
  try {
    const item = await EducationItem.create({ ...req.body, userId: req.params.userId });
    const patch = await enrichEducationItem(item);
    if (Object.keys(patch).length > 0) {
      const enriched = await EducationItem.findByIdAndUpdate(item._id, patch, { new: true });
      res.status(201).json(enriched || item);
      return;
    }
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/education/history/:id — update education item.
// Re-enrich on every PUT (Tim's decision #6 — credential edits recompute financials).
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

    // Re-enrich synchronously so response includes fresh financials
    const patch = await enrichEducationItem(item);
    if (Object.keys(patch).length > 0) {
      const enriched = await EducationItem.findByIdAndUpdate(item._id, patch, { new: true });
      res.json(enriched || item);
      return;
    }
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
