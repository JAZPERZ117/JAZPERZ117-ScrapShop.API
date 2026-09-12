import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
      '/api': 'http://localhost:4000',
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
