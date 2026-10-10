const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler, isValidObjectId } = require('../utils/helpers');
const StoredFile = require('../models/StoredFile');
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'File not found' });
  const file = await StoredFile.findById(req.params.id).select('+data');
  if (!file || (String(file.ownerId) !== String(req.user._id) && !['admin', 'super_admin'].includes(req.user.role))) return res.status(404).json({ success: false, message: 'File not found' });
  res.set({ 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Content-Disposition': 'inline' });
  return res.send(file.data);
}));
module.exports = router;
