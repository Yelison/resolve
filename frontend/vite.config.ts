/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Several checkouts of this repository can run side by side (see docs/development/herdr.md): each one takes its
// own ports from the environment, and without those variables the defaults are the usual single-checkout ones.
const devServerPort = process.env.DEV_SERVER_PORT
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080'

// `vite preview` sirve el build para Playwright: sin este proxy, /api respondería con el index.html.
const proxy = { '/api': apiProxyTarget }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: devServerPort ? Number(devServerPort) : undefined,
    strictPort: Boolean(devServerPort),
    proxy,
  },
  preview: { proxy },
  test: {
    environment: 'jsdom',
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // El catálogo es una página de demostración; se verifica con Playwright, no con tests unitarios.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/app/catalog/**'],
      thresholds: { statements: 80, branches: 75, functions: 75, lines: 80 },
    },
  },
})
