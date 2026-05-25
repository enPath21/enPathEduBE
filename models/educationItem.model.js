const mongoose = require('mongoose');

const educationItemSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    // Core (all types)
    credentialName: { type: String },
    institution: { type: String },
    credentialType: {
      type: String,
      enum: ['degree', 'certification', 'bootcamp', 'course', 'other'],
      default: 'degree',
    },
    status: {
      type: String,
      enum: ['completed', 'in-progress', 'planned'],
      default: 'completed',
    },
    startDate: { type: Date },
    endDate: { type: Date },
    issueDate: { type: Date },       // can differ from endDate
    expiryDate: { type: Date },      // future dates supported
    credentialId: { type: String },  // license/cert number
    deliveryMode: {
      type: String,
      enum: ['online', 'in-person', 'hybrid', 'flexible'],
    },
    location: { type: String },
    focusAreas: [{ type: String }],  // chips/tags
    skillChips: [{ type: String }],   // extracted skill chips from resume or manual entry
    description: { type: String },
    source: { type: String, enum: ['resume', 'manual'], default: 'resume' },

    // Degree-specific
    degree: { type: String },
    field: { type: String },
    concentration: { type: String },
    minor: { type: String },
    honors: {
      type: String,
      enum: ['summa cum laude', 'magna cum laude', 'cum laude', 'honors', ''],
    },
    gpa: { type: Number },
    activities: [{ type: String }],

    // Certification-specific (on top of core)
    verificationUrl: { type: String },
    renewalRequired: { type: Boolean },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EducationItem', educationItemSchema);
