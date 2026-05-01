const mongoose = require('mongoose');

const educationItemSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    institution: { type: String, required: true },
    degree: { type: String },
    field: { type: String },
    credentialType: {
      type: String,
      enum: ['degree', 'certification', 'bootcamp', 'course', 'other'],
      default: 'degree',
    },
    startDate: { type: Date },
    endDate: { type: Date },
    current: { type: Boolean, default: false },
    gpa: { type: Number },
    description: { type: String },
    source: { type: String, enum: ['resume', 'manual'], default: 'resume' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EducationItem', educationItemSchema);
