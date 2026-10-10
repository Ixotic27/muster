const StoredFile = require('../models/StoredFile');

function validateFile(file) {
  const data = file.buffer;
  const valid = file.mimetype === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : file.mimetype === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : file.mimetype === 'image/webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
    : file.mimetype === 'application/pdf' && data.toString('ascii', 0, 5) === '%PDF-';
  if (!valid || data.length > 3 * 1024 * 1024) { const error = new Error('Choose a valid image or PDF smaller than 3 MB.'); error.statusCode = 400; throw error; }
}

function uploadFile(file, folder) {
  if (!file?.buffer) throw new Error('Upload file is required');
  validateFile(file);
  // Payment proofs and NOCs contain private information. Always serve them through
  // the authenticated owner/admin file route, even when the public image CDN is configured.
  return StoredFile.create({ ownerId: file.ownerId, contentType: file.mimetype, purpose: folder.endsWith('/payments') ? 'payment' : 'noc', data: file.buffer, size: file.buffer.length }).then(saved => ({
    url: `/api/v1/files/${saved._id}`, storageKey: String(saved._id), destroy: () => StoredFile.deleteOne({ _id: saved._id })
  }));
}

function uploadPaymentScreenshot(file) { return uploadFile(file, 'muster/payments'); }
function uploadNocDocument(file) { return uploadFile(file, 'muster/noc'); }

module.exports = { uploadFile, uploadPaymentScreenshot, uploadNocDocument };
