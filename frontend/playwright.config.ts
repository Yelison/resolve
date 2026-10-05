import { defineConfig, devices } from '@playwright/test'

// Another checkout may be serving its own preview build at the same time (see docs/development/herdr.md).
const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173)

// El smoke full-stack necesita un backend real (perfil `dev`) y un build `smoke`, que conserva el login de
// demostración: solo existe con SMOKE=1, así que `npm run test:e2e` y el job `e2e` siguen igual.
const SMOKE = process.env.SMOKE === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(SMOKE
      ? [
          {
            name: 'smoke',
            testDir: './e2e-smoke',
            testMatch: '**/*.smoke.ts',
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],
  webServer: {
    // En producción el build no lleva el login de demostración; el smoke usa el modo `smoke` para conservarlo.
    command: `npm run build -- --mode ${SMOKE ? 'smoke' : 'production'} && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
