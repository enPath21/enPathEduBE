'use strict';
/**
 * Internal summary route for Claire AI context.
 * GET /api/edu/internal/summary/:userId
 * Auth: x-api-key (INTERNAL_API_KEY)
 * Returns: full education history + all waypoints with all fields
 */
const express = require('express');
const router = express.Router();
const apiKeyOrAuth = require('../middleware/apiKeyOrAuth');
const EducationItem = require('../models/educationItem.model');
const EducationWaypoint = require('../models/educationWaypoint.model');

router.get('/internal/summary/:userId', apiKeyOrAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const [history, waypoints] = await Promise.all([
      EducationItem.find({ userId }).sort({ endDate: -1 }).lean(),
      EducationWaypoint.find({ userId }).sort({ position: 1 }).lean(),
    ]);

    // Shape history items — full fidelity
    const historyOut = history.map(h => ({
      id: h._id,
      credentialName: h.credentialName || null,
      institution: h.institution,
      credentialType: h.credentialType,
      status: h.status,
      startDate: h.startDate || null,
      endDate: h.endDate || null,
      issueDate: h.issueDate || null,
      expiryDate: h.expiryDate || null,
      deliveryMode: h.deliveryMode || null,
      location: h.location || null,
      focusAreas: h.focusAreas || [],
      skillChips: h.skillChips || [],
      description: h.description || null,
      source: h.source || null,
      // Degree-specific
      degree: h.degree || null,
      field: h.field || null,
      concentration: h.concentration || null,
      minor: h.minor || null,
      honors: h.honors || null,
      gpa: h.gpa || null,
      activities: h.activities || [],
      // Cert-specific
      credentialId: h.credentialId || null,
      verificationUrl: h.verificationUrl || null,
      renewalRequired: h.renewalRequired ?? null,
    }));

    // Shape waypoints — full fidelity
    const waypointsOut = waypoints.map(w => ({
      id: w._id,
      waypointId: w.waypointId,
      credentialName: w.credentialName,
      institution: w.institution || null,
      credentialType: w.credentialType || null,
      location: w.location || null,
      deliveryMode: w.deliveryMode || null,
      projectedYear: w.projectedYear || null,
      durationMonths: w.durationMonths || null,
      tuitionMin: w.tuitionMin || null,
      tuitionMax: w.tuitionMax || null,
      tuitionMidpoint: w.tuitionMidpoint || null,
      salaryImpactPct: w.salaryImpactPct || null,
      salaryRoiPerYear: w.salaryRoiPerYear || null,
      rationale: w.rationale || null,
      status: w.status,
      position: w.position || null,
      confidence: w.confidence || null,
      url: w.url || null,
      financialAid: w.financialAid || false,
      tags: w.tags || [],
      userStartDate: w.userStartDate || null,
      userEndDate: w.userEndDate || null,
      isCompleted: w.isCompleted || false,
      matchProbabilityBoost: w.matchProbabilityBoost || null,
      matchWaypointLabel: w.matchWaypointLabel || null,
    }));

    res.json({ history: historyOut, waypoints: waypointsOut });
  } catch (err) {
    console.error('[edu/internal/summary] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
