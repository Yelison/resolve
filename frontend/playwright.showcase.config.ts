import { defineConfig, devices } from '@playwright/test'

// La demostración estática se prueba contra su propio build (`--mode showcase`, base `/resolve/`) servido con
// `vite preview`: sin API ni proxy, como en GitHub Pages. Otro checkout puede estar sirviendo el suyo a la vez
// (docs/development/herdr.md), de ahí el puerto por variable. No forma parte de `npm run test:e2e`.
const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173)

export default defineConfig({
  testDir: './e2e-showcase',
  testMatch: '**/*.showcase.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // La barra final importa: las rutas de las pruebas son relativas (`tickets`, no `/tickets`) y se resuelven bajo la base.
    baseURL: `http://localhost:${PORT}/resolve/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'showcase', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build:showcase && npm run preview -- --mode showcase --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/resolve/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
