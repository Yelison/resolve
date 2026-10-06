/// <reference types="vitest/config" />
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Several checkouts of this repository can run side by side (see docs/development/herdr.md): each one takes its
// own ports from the environment, and without those variables the defaults are the usual single-checkout ones.
const devServerPort = process.env.DEV_SERVER_PORT
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080'

// `vite preview` sirve el build para Playwright: sin este proxy, /api respondería con el index.html.
const proxy = { '/api': apiProxyTarget }

// La demostración estática (`vite build --mode showcase`) se publica en GitHub Pages bajo `/resolve/` y no tiene
// servidor: sin `/api` que reenviar y con su propio directorio, para no pisar el build de producción que leen los e2e.
const SHOWCASE_BASE = '/resolve/'
const SHOWCASE_OUT_DIR = 'dist/showcase'

/**
 * GitHub Pages responde con `404.html` a una ruta que no existe: copiar ahí el `index.html` hace que una URL profunda
 * (`/resolve/tickets/1047`) cargue la aplicación y el router resuelva la ruta.
 */
const spaFallback: Plugin = {
  name: 'showcase-spa-fallback',
  apply: 'build',
  closeBundle() {
    const out = resolve(import.meta.dirname, SHOWCASE_OUT_DIR)
    copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const showcase = mode === 'showcase'
  return {
    ...(showcase && { base: SHOWCASE_BASE, build: { outDir: SHOWCASE_OUT_DIR } }),
    plugins: [react(), ...(showcase ? [spaFallback] : [])],
    server: {
      port: devServerPort ? Number(devServerPort) : undefined,
      strictPort: Boolean(devServerPort),
      proxy,
    },
    preview: showcase ? {} : { proxy },
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
  }
})
