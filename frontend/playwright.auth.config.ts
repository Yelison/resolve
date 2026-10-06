import { defineConfig, devices } from '@playwright/test'

// Contra un backend real con los perfiles `dev,oidc`, Keycloak y la aplicación servida desde el jar (mismo origen,
// como en producción): no hay `webServer` ni Vite. `SERVER_PORT` es el de la API (8080 por defecto, el del slot en
// Herdr) y `RESOLVE_PUBLIC_URL` del jar debe ser esta misma URL. Ver docs/development/herdr.md y el README.
const PORT = Number(process.env.SERVER_PORT || 8080)

export default defineConfig({
  testDir: './e2e-auth',
  testMatch: '**/*.spec.ts',
  // Un solo navegador a la vez: las escenas comparten la base de datos y el realm, y Keycloak en modo dev es lento.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'auth', use: { ...devices['Desktop Chrome'] } }],
})
