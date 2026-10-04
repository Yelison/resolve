/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
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
