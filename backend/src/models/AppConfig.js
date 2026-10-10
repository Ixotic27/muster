const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String, maxlength: 500 },
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', appConfigSchema);
