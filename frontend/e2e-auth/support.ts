import { expect, type APIResponse, type BrowserContext, type Page } from '@playwright/test'

/**
 * Cuentas del realm de desarrollo (`deploy/keycloak/resolve-realm.json`). La contraseña `demo` es un valor de ese
 * realm local, no una credencial real.
 */
export const accounts = {
  admin: { email: 'yelisson.ortiz@acme.example', name: 'Yelisson Ortiz' },
  laura: { email: 'laura.mendez@acme.example', name: 'Laura Méndez' },
  jordi: { email: 'jordi.puig@northwind.example', name: 'Jordi Puig' },
} as const
export const REALM_PASSWORD = 'demo'

/** Ruta del formulario de entrada de Keycloak: que la URL la contenga prueba que el login pasó por el proveedor. */
export const KEYCLOAK_AUTH_PATH = '/realms/resolve/protocol/openid-connect/auth'

/** Origen de la aplicación servida desde el jar: el mismo que `baseURL` de playwright.auth.config.ts. */
const APP_ORIGIN = `http://localhost:${Number(process.env.SERVER_PORT || 8080)}`
const KEYCLOAK_PORT = Number(process.env.KEYCLOAK_PORT || 8180)
export const KEYCLOAK_URL = `http://localhost:${KEYCLOAK_PORT}`
// Valor de desarrollo de docker-compose.yml, sobrescribible como allí.
const KEYCLOAK_ADMIN_PASSWORD = process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || 'admin'

export const sessionCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === 'JSESSIONID' && cookie.path === '/api')

/** Va a la pantalla de entrada y pulsa «Entrar con tu cuenta»: el navegador queda en el formulario de Keycloak. */
export async function openKeycloakLogin(page: Page) {
  await page.goto('/entrar')
  // Guardia contra el modo demostración: sin `oidc` esta API contestaría con el usuario demo en lugar de un 401, y el
  // botón nunca llegaría a Keycloak. Se dice aquí, en menos de 1 s, en vez de dejar que se agote el tiempo del clic.
  expect(
    (await page.request.get('/api/me')).status(),
    'sin sesión la API debe contestar 401: ¿arrancó con el perfil oidc o cayó al modo demostración (dev sin oidc)?',
  ).toBe(401)
  await page.getByRole('button', { name: 'Entrar con tu cuenta' }).click()
  await expect(page).toHaveURL(new RegExp(`${KEYCLOAK_AUTH_PATH}\\?`))
}

/** Rellena el formulario de Keycloak (que ya está abierto) y espera a volver a la aplicación. */
export async function submitKeycloakLogin(page: Page, email: string) {
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(REALM_PASSWORD)
  await page.locator('#kc-login').click()
  // De vuelta en la aplicación (su origen, no el de Keycloak) y fuera del paso intermedio de /api/login/oauth2/code.
  await expect(page).toHaveURL((url) => url.origin === APP_ORIGIN && !url.pathname.startsWith('/api/'))
}

/** Entra con ese usuario del realm por el flujo real y espera a ver la aplicación con su cuenta. */
export async function signIn(page: Page, email: string) {
  await openKeycloakLogin(page)
  await submitKeycloakLogin(page, email)
  await expect(page.getByRole('button', { name: /^Cuenta:/ })).toBeVisible()
}

/**
 * Escritura contra la API con la sesión del navegador. Pide antes un GET para que exista la cookie `XSRF-TOKEN`
 * (la API la entrega con la primera respuesta autenticada) y la manda en `X-XSRF-TOKEN`, como hace la aplicación.
 */
export async function apiSend(page: Page, method: 'POST' | 'PATCH', path: string, data: unknown): Promise<APIResponse> {
  await page.request.get('/api/me')
  const token = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value
  expect(token, 'la cookie XSRF-TOKEN llega con la primera respuesta autenticada').toBeTruthy()
  return page.request.fetch(`/api${path}`, { method, data, headers: { 'X-XSRF-TOKEN': token! } })
}

/** Token de la API de administración de Keycloak (cliente `admin-cli` del realm `master`). */
async function adminToken(): Promise<string> {
  const response = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: 'admin',
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
  })
  expect(response.ok, `token de administración de Keycloak: ${response.status}`).toBe(true)
  return ((await response.json()) as { access_token: string }).access_token
}

async function findUserId(token: string, email: string): Promise<string | undefined> {
  const response = await fetch(
    `${KEYCLOAK_URL}/admin/realms/resolve/users?email=${encodeURIComponent(email)}&exact=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  expect(response.ok).toBe(true)
  return ((await response.json()) as { id: string }[])[0]?.id
}

/** Crea (si no existe) una cuenta del realm que no está en el archivo del realm. */
export async function ensureRealmUser(email: string, firstName: string, lastName: string) {
  const token = await adminToken()
  if (await findUserId(token, email)) return
  const response = await fetch(`${KEYCLOAK_URL}/admin/realms/resolve/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      email,
      emailVerified: true,
      enabled: true,
      firstName,
      lastName,
      credentials: [{ type: 'password', value: REALM_PASSWORD, temporary: false }],
    }),
  })
  expect(response.status, 'crear la cuenta en Keycloak').toBe(201)
}

export async function deleteRealmUser(email: string) {
  const token = await adminToken()
  const id = await findUserId(token, email)
  if (!id) return
  await fetch(`${KEYCLOAK_URL}/admin/realms/resolve/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
