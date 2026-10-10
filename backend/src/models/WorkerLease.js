const mongoose = require('mongoose');
module.exports = mongoose.model('WorkerLease', new mongoose.Schema({ _id: String, owner: String, until: Date, lastStartedAt: Date, lastFinishedAt: Date, lastResult: { state: String, sent: Number, reason: String } }));
