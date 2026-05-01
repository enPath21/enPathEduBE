const mongoose = require('mongoose');

const educationWaypointSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    waypointId: { type: String, required: true, unique: true },
    credentialName: { type: String, required: true },
    institution: { type: String },
    credentialType: {
      type: String,
      enum: ['degree', 'certification', 'bootcamp', 'course', 'other'],
    },
    location: { type: String },
    deliveryMode: {
      type: String,
      enum: ['online', 'in-person', 'hybrid', 'flexible'],
    },
    projectedYear: { type: Number },
    durationMonths: { type: Number },
    tuitionMin: { type: Number },
    tuitionMax: { type: Number },
    tuitionMidpoint: { type: Number },
    salaryImpactPct: { type: Number },
    salaryRoiPerYear: { type: Number },
    rationale: { type: String },
    position: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'replaced'],
      default: 'pending',
    },
    replacedById: { type: String },
    agentRunId: { type: String },
    confidence: { type: Number },
    url: { type: String },
    financialAid: { type: Boolean, default: false },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('EducationWaypoint', educationWaypointSchema);
