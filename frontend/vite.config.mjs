import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Only these public settings reach browser bundles. SMTP, JWT and payment secrets
// belong in backend/.env and must never be copied here.
const publicSettings = ['SITE_NAME', 'SITE_TAGLINE', 'SUPPORT_EMAIL', 'LOCALE', 'TIMEZONE', 'API_URL'];
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const define = Object.fromEntries(publicSettings.map(key => [
    `process.env.REACT_APP_${key}`, JSON.stringify(process.env[`REACT_APP_${key}`] || env[`REACT_APP_${key}`] || '')
  ]));
  return {
    plugins: [react()],
    define,
    server: {
      strictPort: true,
      proxy: {
        '/api': { target: process.env.REACT_APP_BACKEND_URL || env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true },
        '/socket.io': { target: process.env.REACT_APP_BACKEND_URL || env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5000', changeOrigin: true, ws: true }
      }
    },
    build: { sourcemap: false }
  };
});
