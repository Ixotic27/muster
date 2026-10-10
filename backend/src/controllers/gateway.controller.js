const { createGatewayService, configuration } = require('../services/payment-gateway.service');
const service = createGatewayService();
function config(req, res) {
  const { enabled, testMode } = configuration();
  return res.json({ success: true, enabled, testMode, provider: 'razorpay' });
}
async function orders(req, res) { return res.status(201).json(await service.createOrder(req.body.registrationId, req.user._id)); }
async function verify(req, res) { return res.json(await service.verify(req.body, req.user._id)); }
async function webhook(req, res) { return res.json(await service.webhook(req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'))); }
module.exports = { config, orders, verify, webhook };
