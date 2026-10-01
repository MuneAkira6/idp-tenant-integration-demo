/**
 * The web client (apps/web, port 18401), built by Rsbuild 2 (facts F8, F9).
 *
 * `/auth/*` and `/api/*` are proxied to the API on 18400, so the browser sees one origin: the session
 * cookie, the sign-in redirect and every API call go through the same host, as they would behind a
 * reverse proxy in a deployment.
 */

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const API = process.env.API_BASE_URL ?? 'http://localhost:18400'

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: './src/main.tsx' } },
  html: { template: './index.html' },
  server: {
    port: Number(process.env.WEB_PORT ?? 18401),
    host: '127.0.0.1',
    proxy: {
      '/auth': { target: API, changeOrigin: false },
      '/api': { target: API, changeOrigin: false },
    },
  },
})
