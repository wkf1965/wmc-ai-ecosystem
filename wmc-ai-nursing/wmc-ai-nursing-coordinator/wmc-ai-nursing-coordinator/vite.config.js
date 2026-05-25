import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { telegramWebhookPlugin } from './telegramWebhookPlugin.mjs'
import { bootstrapDevServer } from './src/server.ts'

/** Prints hybrid NLP startup banner when Vite dev server boots. */
function devServerBootstrapPlugin() {
  return {
    name: 'wmc-dev-server-bootstrap',
    configureServer() {
      bootstrapDevServer()
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }

  return {
    plugins: [devServerBootstrapPlugin(), react(), tailwindcss(), telegramWebhookPlugin()],
    server: {
      port: 3000,
      proxy: {
        // Inventory API lives on the Telegram webhook server (port 3001).
        // More-specific prefix must be declared BEFORE the generic /api entry.
        '/api/inventory': {
          target:      env.VITE_TELEGRAM_SERVER_URL || 'http://localhost:3001',
          changeOrigin: true,
          // no path rewrite — endpoint is already /api/inventory/...
        },
        // Attendance API (also on port 3001)
        '/api/attendance': {
          target:      env.VITE_TELEGRAM_SERVER_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
        // All other /api calls go to the main wmc-ai-backend (port 4000).
        '/api': {
          target:      env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true,
          rewrite:     (path) => path.replace(/^\/api/, '/api/v1'),
        },
      },
    },
  }
})
