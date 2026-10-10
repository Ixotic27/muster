const cloudinary = require('cloudinary').v2;

let configured = false;

function configureCloudinary() {
  if (configured) return true;
  if (!process.env.CLOUDINARY_URL && !(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) return false;
  if (process.env.CLOUDINARY_URL) {
    const parsed = new URL(process.env.CLOUDINARY_URL);
    cloudinary.config({ cloud_name: parsed.hostname, api_key: decodeURIComponent(parsed.username), api_secret: decodeURIComponent(parsed.password), secure: true });
  }
  else cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  configured = true;
  return true;
}

module.exports = { cloudinary, configureCloudinary };
