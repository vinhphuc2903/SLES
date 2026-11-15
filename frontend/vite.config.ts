import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:5169'

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: false },
      },
    },
    test: { exclude: ['e2e/**', 'node_modules/**'], environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
  }
})
