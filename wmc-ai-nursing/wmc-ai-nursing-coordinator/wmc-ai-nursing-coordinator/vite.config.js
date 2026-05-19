import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { telegramWebhookPlugin } from './telegramWebhookPlugin.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }

  return {
    plugins: [react(), tailwindcss(), telegramWebhookPlugin()],
    server: {
      /** Proxy REST calls from the SPA dev server to wmc-ai-backend (run backend on 4000). */
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
        },
      },
    },
  }
})
