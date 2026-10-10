const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contentType: { type: String, required: true },
  purpose: { type: String, enum: ['payment', 'noc'], required: true },
  data: { type: Buffer, required: true, select: false },
  size: { type: Number, required: true }
}, { timestamps: true });
module.exports = mongoose.model('StoredFile', schema);
