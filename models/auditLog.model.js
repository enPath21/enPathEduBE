const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        'goal_created',
        'goal_edited',
        'goal_archived',
        'pathway_generated',
        'pathway_regenerated',
        'waypoint_declined',
        'education_applied',
        'industry_signal',
        'role_signal',
      ],
    },
    subject: { type: String, required: true },
    detail: { type: String, required: true },
    action: { type: String, default: '' },
    source: { type: String, enum: ['eia', 'cia', 'user'], required: true },
    read: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
