/**
 * PM2 development convenience config.
 *
 * PURPOSE: Local development only — starts the Vite dev server under PM2 so
 * it can be daemonised and auto-restarted.  Do NOT use this for production.
 *
 * PRODUCTION: This app builds to a static SPA (`npm run build` → dist/).
 * Deploy the dist/ folder to any static host (Vercel, Netlify, Supabase
 * Storage, nginx, etc.).  There is no Node.js server process at runtime.
 * If you are serving via nginx or a CDN, add the HTTP security headers from
 * index.html (CSP, X-Content-Type-Options, Referrer-Policy) at the server
 * level so they cannot be stripped by the browser's meta-tag CSP limitations.
 *
 * USAGE (development):
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs vite
 *   pm2 stop vite
 */
module.exports = {
  apps: [{
    name: 'vite',
    script: 'sh',
    args: '-c "npm run dev"',
    cwd: __dirname,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    }
  }]
};
