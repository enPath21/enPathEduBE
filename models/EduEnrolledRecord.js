const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  userId:         { type: String, required: true, index: true },
  matchId:        { type: String, required: true },
  credentialName: { type: String },
  institution:    { type: String },
  url:            { type: String, default: null },
  enrolledAt:     { type: Date, default: Date.now },
}, { timestamps: true })
schema.index({ userId: 1, matchId: 1 }, { unique: true })
module.exports = mongoose.model('EduEnrolledRecord', schema)
