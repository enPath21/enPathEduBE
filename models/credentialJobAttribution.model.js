const mongoose = require('mongoose');

// Per-user resolved (credential × job/waypoint) attribution matrix.
// One row per (userId, credentialId, jobRef.id).
// Populated at read time (lazy) from EIA /enrich-job-credentials response.
// See edu-salary-attribution-spec.md.

const credentialJobAttributionSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true, index: true },
    credentialId: { type: String, required: true },   // ObjectId string of EducationItem

    jobRef: {
      type:  { type: String, enum: ['past', 'current', 'waypoint'], required: true },
      id:    { type: String, required: true },        // ObjectId string of Job or CareerWaypoint
      titleSnapshot: { type: String, required: true }, // for invalidation on title change
    },

    necessity:  { type: String, enum: ['required', 'preferred', 'irrelevant'], required: true },
    weight:     { type: Number, required: true },
    confidence: { type: Number, required: true },
    reasoning:  { type: String, default: '' },

    userOverride:  { type: Boolean, default: false },
    cacheHitFrom:  { type: String, default: null },   // AttributionCache _id (string) if cache hit
    enrichedAt:    { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'credential_job_attribution' },
);

credentialJobAttributionSchema.index(
  { userId: 1, credentialId: 1, 'jobRef.id': 1 },
  { unique: true, name: 'user_cred_job_unique' },
);

module.exports = mongoose.model(
  'CredentialJobAttribution',
  credentialJobAttributionSchema,
);
