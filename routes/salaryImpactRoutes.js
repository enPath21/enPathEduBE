/**
 * Salary Impact route — GET /api/edu/salary-impact/:userId
 *
 * Powers the 3 KPI cards on the Edu dashboard:
 *   - Past Salary Impact (20Y)
 *   - Future Salary Impact (20Y)
 *   - Total Salary Impact (20Y)
 *
 * Algorithm (see edu-salary-attribution-spec.md):
 *   1. Fetch TYE from Jobs BE (per-year earnings, past + projected)
 *   2. Fetch user's Jobs + Waypoints from Jobs BE
 *   3. Reconstruct TYE-year → job/waypoint source mapping locally
 *   4. Fetch user's EducationItems from local Edu DB
 *   5. For each (year, job) determine which credentials qualify (completionYear <= year)
 *   6. Look up cached (userId, credentialId, jobRef.id) attributions;
 *      any missing → call EIA /enrich-job-credentials (grouped per job),
 *      persist result, or return status='calculating' if not yet ready
 *   7. Apply necessity-tier attribution algorithm year-by-year
 *   8. Bucket into Past 20Y / Future 20Y / Total 20Y
 *   9. Compute missingData notes
 *  10. Return
 */

const express = require('express');
const router = express.Router();
const EducationItem = require('../models/educationItem.model');
const CredentialJobAttribution = require('../models/credentialJobAttribution.model');
const authMiddleware = require('../middleware/authMiddleware');

const JOBS_BE_URL =
  process.env.JOBS_BE_URL || 'https://enpath-backend-285173621267.us-central1.run.app';
const EIA_BASE_URL =
  process.env.EIA_URL || 'https://enpath-edu-agent-285173621267.us-central1.run.app';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
  console.error('FATAL: INTERNAL_API_KEY is not set');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────

function pickYear(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear();
}

// Derive the credential's "completion year" from EducationItem fields.
// Mirrors the frontend getHistoryYear() helper: endDate → startDate → issueDate.
function credentialCompletionYear(item) {
  return (
    pickYear(item.endDate) ||
    pickYear(item.startDate) ||
    pickYear(item.issueDate) ||
    null
  );
}

// Classify education item as degree vs certification (used only for logging;
// necessity tiering comes from EIA, not from credentialType alone)
function isDegree(item) {
  return item.credentialType === 'degree';
}

// Reconstruct TYE-year → job/waypoint source mapping.
// Past jobs cover [startDate.year, endDate.year]. Current job (no endDate) covers
// [startDate.year, currentYear + phase1Years]. Waypoints cover their projectedYear.
// Returns { year → { jobRef: {type,id,titleSnapshot} | null } }
function buildYearToJobMap(jobs, waypoints, currentYear, tyeYears) {
  const map = new Map();

  // Sort jobs by startDate ascending
  const sortedJobs = [...jobs].sort((a, b) => {
    const da = a.startDate ? new Date(a.startDate).getTime() : 0;
    const db = b.startDate ? new Date(b.startDate).getTime() : 0;
    return da - db;
  });

  // Past + current jobs
  for (const job of sortedJobs) {
    const startY = pickYear(job.startDate);
    if (!startY) continue;
    const endY   = pickYear(job.endDate) || currentYear;
    const isCurrent = !job.endDate;
    for (let y = startY; y <= endY; y++) {
      map.set(y, {
        type: isCurrent ? 'current' : 'past',
        id:   String(job.id || job._id),
        titleSnapshot: job.jobTitle || job.title || 'Unknown Job',
      });
    }
  }

  // Waypoints — sorted by projectedYear
  const sortedWps = [...(waypoints || [])].sort(
    (a, b) => (a.projectedYear || 0) - (b.projectedYear || 0),
  );
  // Each waypoint owns years [projectedYear, projectedYear + estimatedTenureYears - 1]
  for (const wp of sortedWps) {
    const startY = wp.projectedYear;
    if (!startY) continue;
    const tenure = wp.estimatedTenureYears || 3;
    for (let y = startY; y < startY + tenure; y++) {
      // Don't overwrite already-mapped past/current jobs
      if (!map.has(y)) {
        map.set(y, {
          type: 'waypoint',
          id:   String(wp._id || wp.id),
          titleSnapshot: wp.jobTitle || wp.title || 'Future Role',
        });
      }
    }
  }

  return map;
}

// ── Route ────────────────────────────────────────────────────────

router.get('/salary-impact/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const authHeader = req.headers.authorization; // forward user's Bearer JWT to Jobs BE

  try {
    // 1. Fetch TYE, Jobs, Waypoints in parallel from Jobs BE
    const [tyeRes, jobsRes, wpsRes] = await Promise.all([
      fetch(`${JOBS_BE_URL}/api/jobs/tye/${userId}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        signal:  AbortSignal.timeout(8000),
      }),
      fetch(`${JOBS_BE_URL}/api/jobs/user/${userId}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        signal:  AbortSignal.timeout(8000),
      }),
      fetch(`${JOBS_BE_URL}/api/jobs/waypoints/${userId}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        signal:  AbortSignal.timeout(8000),
      }),
    ]);

    if (!tyeRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch TYE from Jobs BE' });
    }
    const tyeDoc = await tyeRes.json();
    const jobs   = jobsRes.ok ? await jobsRes.json() : [];
    const wpsDoc = wpsRes.ok  ? await wpsRes.json() : { waypoints: [] };
    const waypoints = wpsDoc.waypoints || wpsDoc || [];

    // 2. Fetch EducationItems locally
    const items = await EducationItem.find({ userId }).lean();
    const credentials = items.map(i => ({
      credentialId:   String(i._id),
      name:           i.credentialName || i.degree || 'Untitled credential',
      type:           i.credentialType,
      completionYear: credentialCompletionYear(i),
      status:         i.status,
    }));

    // Determine market — take from first job's geoDataSource, default 'US'
    const market = (jobs.find(j => j.geoDataSource)?.geoDataSource) || 'US';

    // 3. Build year → job map
    const currentYear = new Date().getFullYear();
    const tyeYears    = tyeDoc.years || [];
    const yearToJob   = buildYearToJobMap(jobs, waypoints, currentYear, tyeYears);

    // 4. Determine unique (credential × job) pairs we need attribution for
    // Skip credentials without completionYear or with status='planned'
    const eligibleCreds = credentials.filter(
      c => c.completionYear && c.status !== 'planned',
    );

    // Group by jobRef.id (one EIA call per unique job)
    const jobsById = new Map();
    for (const [year, jobRef] of yearToJob.entries()) {
      if (!jobsById.has(jobRef.id)) {
        jobsById.set(jobRef.id, jobRef);
      }
    }

    // 5. Fetch existing per-user attributions
    const existing = await CredentialJobAttribution.find({ userId }).lean();
    const existingKey = new Map(); // "credId::jobId" → row
    for (const row of existing) {
      existingKey.set(`${row.credentialId}::${row.jobRef.id}`, row);
    }

    // 6. Identify missing pairs — enqueue enrichment calls per job
    const missingPairsByJob = new Map(); // jobId → { jobRef, creds: [] }
    for (const [jobId, jobRef] of jobsById.entries()) {
      for (const c of eligibleCreds) {
        // Only include credentials that existed by the earliest year this job covers.
        // We include all eligible creds here — EIA will mark irrelevant/preferred/required.
        const key = `${c.credentialId}::${jobId}`;
        if (!existingKey.has(key)) {
          if (!missingPairsByJob.has(jobId)) {
            missingPairsByJob.set(jobId, { jobRef, creds: [] });
          }
          missingPairsByJob.get(jobId).creds.push(c);
        }
      }
    }

    // If there are missing pairs, call EIA per job (sequentially to bound Perplexity load)
    let anyEnrichmentFailed = false;
    for (const [jobId, { jobRef, creds }] of missingPairsByJob.entries()) {
      try {
        const eiaRes = await fetch(`${EIA_BASE_URL}/api/agent/enrich-job-credentials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key':    INTERNAL_API_KEY,
          },
          body: JSON.stringify({
            market,
            job: { title: jobRef.titleSnapshot },
            credentials: creds.map(c => ({
              credentialId:   c.credentialId,
              name:           c.name,
              type:           c.type,
              completionYear: c.completionYear,
            })),
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (!eiaRes.ok) {
          anyEnrichmentFailed = true;
          console.warn('[salary-impact] EIA enrichment failed:', jobRef.titleSnapshot, eiaRes.status);
          continue;
        }
        const data = await eiaRes.json();
        for (const a of data.attributions || []) {
          const doc = {
            userId,
            credentialId: a.credentialId,
            jobRef: {
              type:          jobRef.type,
              id:            jobRef.id,
              titleSnapshot: jobRef.titleSnapshot,
            },
            necessity:  a.necessity,
            weight:     a.weight,
            confidence: a.confidence,
            reasoning:  a.reasoning,
            enrichedAt: new Date(),
          };
          await CredentialJobAttribution.findOneAndUpdate(
            { userId, credentialId: a.credentialId, 'jobRef.id': jobRef.id },
            { $set: doc },
            { upsert: true },
          );
          existingKey.set(`${a.credentialId}::${jobRef.id}`, doc);
        }
      } catch (err) {
        anyEnrichmentFailed = true;
        console.warn('[salary-impact] EIA call error:', jobRef.titleSnapshot, err.message);
      }
    }

    // 7. Apply attribution algorithm year-by-year
    const pastWindowStart   = currentYear - 20;
    const pastWindowEnd     = currentYear;
    const futureWindowStart = currentYear + 1;
    const futureWindowEnd   = currentYear + 20;

    let past20   = 0;
    let future20 = 0;
    const perCredCredits = new Map();     // credentialId → total credit
    let uncreditedYears  = [];            // years with earnings but no qualifying credential

    for (const { year, earnings } of tyeYears) {
      const jobRef = yearToJob.get(year);
      if (!jobRef || !earnings) continue;
      if (year < pastWindowStart || year > futureWindowEnd) continue;

      // Find credentials that (a) user held by this year (b) attribution exists
      const yearCreds = eligibleCreds
        .filter(c => c.completionYear <= year)
        .map(c => ({
          ...c,
          attribution: existingKey.get(`${c.credentialId}::${jobRef.id}`),
        }))
        .filter(x => x.attribution && x.attribution.necessity !== 'irrelevant');

      const requiredTier  = yearCreds.filter(x => x.attribution.necessity === 'required');
      const preferredTier = yearCreds.filter(x => x.attribution.necessity === 'preferred');
      const activeTier    = requiredTier.length > 0 ? requiredTier : preferredTier;

      if (activeTier.length === 0) {
        uncreditedYears.push(year);
        continue;
      }

      const totalWeight = activeTier.reduce((s, x) => s + x.attribution.weight, 0) || 1;
      for (const x of activeTier) {
        const credit = earnings * (x.attribution.weight / totalWeight);
        if (year <= pastWindowEnd) past20 += credit;
        else if (year >= futureWindowStart) future20 += credit;
        perCredCredits.set(
          x.credentialId,
          (perCredCredits.get(x.credentialId) || 0) + credit,
        );
      }
    }

    // 8. Missing-data notes
    const missingData = [];

    const jobsMissingSalary = jobs.filter(
      j => !j.startingSalary && !j.endingSalary,
    ).length;
    if (jobsMissingSalary > 0) {
      missingData.push({
        code: 'job_missing_salary',
        count: jobsMissingSalary,
        actionText: `${jobsMissingSalary} past job(s) missing salary`,
      });
    }

    if (!waypoints || waypoints.length === 0) {
      missingData.push({
        code: 'no_archetype_pathway',
        count: null,
        actionText: 'No archetype pathway set — future capped at current role',
      });
    }

    const credsMissingCompletionDate = credentials.filter(
      c => !c.completionYear,
    ).length;
    if (credsMissingCompletionDate > 0) {
      missingData.push({
        code: 'credential_missing_completion_date',
        count: credsMissingCompletionDate,
        actionText: `${credsMissingCompletionDate} credential(s) missing completion date`,
      });
    }

    const lowConfidence = Array.from(existingKey.values()).filter(
      a => a.confidence < 0.7 && a.necessity !== 'irrelevant',
    ).length;
    if (lowConfidence > 0) {
      missingData.push({
        code: 'low_confidence_attribution',
        count: lowConfidence,
        actionText: `${lowConfidence} credential-job attribution(s) low confidence`,
      });
    }

    if (uncreditedYears.length > 0) {
      missingData.push({
        code: 'uncredited_years',
        count: uncreditedYears.length,
        actionText: `${uncreditedYears.length} year(s) not credited to any education (no matching credentials)`,
      });
    }

    // Status
    let status = 'ready';
    if (anyEnrichmentFailed) status = 'partial';

    return res.json({
      past20:  Math.round(past20),
      future20: Math.round(future20),
      total20: Math.round(past20 + future20),
      status,
      missingData,
      byCredential: Array.from(perCredCredits.entries()).map(([credentialId, credit]) => ({
        credentialId,
        credit: Math.round(credit),
      })),
      window: { pastStart: pastWindowStart, pastEnd: pastWindowEnd, futureStart: futureWindowStart, futureEnd: futureWindowEnd },
    });
  } catch (err) {
    console.error('[salary-impact] error:', err.message);
    return res.status(500).json({ error: 'Failed to compute salary impact' });
  }
});

module.exports = router;
