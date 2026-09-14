import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Mirrors server/src/index.js's own check exactly: once a cert/key pair exists there, the
// backend switches entirely from plain HTTP to HTTPS — this dev proxy has to target whichever
// one is actually listening, or it fails to connect at all (not just a cert warning) the moment
// someone generates a cert on their machine for a real LAN deployment. `secure: false` skips
// verifying that cert against a real CA, since a self-signed one never validates as trusted.
const hasBackendCert =
  existsSync(fileURLToPath(new URL('./server/certs/cert.pem', import.meta.url))) &&
  existsSync(fileURLToPath(new URL('./server/certs/key.pem', import.meta.url)))
const backendPort = process.env.BACKEND_PORT || 4000
const backendOrigin = `${hasBackendCert ? 'https' : 'http'}://localhost:${backendPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind every interface (not just localhost) so other devices on the shop's LAN can open
    // this app — paired with the backend's CORS allowlist below, which only trusts origins on
    // private address ranges, so this doesn't by itself expose the app past the local network.
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
    proxy: {
      '/api': { target: backendOrigin, secure: false },
    },
  },
  test: {
    // happy-dom instead of jsdom — jsdom's bundled undici crashes instantiating its
    // CacheStorage global under Linux CI runners (a known jsdom/Node compatibility bug
    // unrelated to anything this test suite actually exercises); happy-dom sidesteps it
    // entirely and is the standard alternative for Vitest.
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
