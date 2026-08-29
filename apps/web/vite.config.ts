import { defineConfig } from 'vite';
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const developmentHeaders = {
  ...headers,
  // Vite injects transformed CSS through style elements during development only.
  'Content-Security-Policy': headers['Content-Security-Policy'].replace(
    "style-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ),
};
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: ['hashbrowns.taila6a64.ts.net'],
    headers: developmentHeaders,
    proxy: {
      '/signal': { target: 'ws://127.0.0.1:3001', ws: true },
      '/config': { target: 'http://127.0.0.1:3001' },
    },
  },
  preview: { headers },
});
