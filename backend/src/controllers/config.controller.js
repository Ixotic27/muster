const { AppConfig } = require('../models');

async function getPublicConfig(req, res) {
  const entries = await AppConfig.find({ isPublic: true }).select('key value -_id').lean();
  const config = entries.reduce((result, entry) => { result[entry.key] = entry.value; return result; }, {});
  config.password_reset_available = Boolean(require('../config/email').getEmailTransporter());
  config.brand_name = process.env.BRAND_NAME || 'EventFlow';
  config.manual_payments_available = process.env.ENABLE_MANUAL_PAYMENTS === 'true' && Boolean(process.env.PAYMENT_UPI_ID);
  config.payment_test_mode = process.env.PAYMENT_TEST_MODE !== 'false';
  if (config.payment_upi_id === undefined && process.env.PAYMENT_UPI_ID) config.payment_upi_id = process.env.PAYMENT_UPI_ID;
  if (config.payment_upi_name === undefined && process.env.PAYMENT_UPI_NAME) config.payment_upi_name = process.env.PAYMENT_UPI_NAME;
  if (config.frontend_url === undefined && process.env.FRONTEND_URL) config.frontend_url = process.env.FRONTEND_URL;
  return res.json({ success: true, config });
}

async function listConfig(req, res) {
  const entries = await AppConfig.find().sort({ key: 1 }).lean();
  return res.json({ success: true, config: entries });
}

async function upsertConfig(req, res) {
  const key = String(req.params.key || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(key)) return res.status(400).json({ success: false, message: 'Invalid config key' });
  const entry = await AppConfig.findOneAndUpdate(
    { key },
    { $set: { value: req.body.value, description: req.body.description, isPublic: req.body.isPublic === true } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return res.json({ success: true, config: entry });
}

module.exports = { getPublicConfig, listConfig, upsertConfig };
