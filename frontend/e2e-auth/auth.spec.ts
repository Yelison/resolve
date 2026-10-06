import { expect, test, type Page } from '@playwright/test'
import {
  accounts,
  apiSend,
  deleteRealmUser,
  ensureRealmUser,
  KEYCLOAK_AUTH_PATH,
  openKeycloakLogin,
  sessionCookie,
  signIn,
  submitKeycloakLogin,
} from './support'

/**
 * Autenticación de punta a punta con Keycloak real y la aplicación servida desde el jar (mismo origen, perfiles
 * `dev,oidc`). Nada está simulado: cada escenario entra por el formulario del proveedor de identidad.
 */

const account = (page: Page) => page.getByRole('button', { name: /^Cuenta:/ })

test('Laura entra con el usuario y la contraseña del realm y ve su nombre', async ({ page }) => {
  await page.goto('/entrar')
  // Guardia contra el modo demostración: con `oidc` no hay selector de usuario ni cabecera X-Demo-User.
  await expect(page.getByText('Demostración')).toHaveCount(0)

  await openKeycloakLogin(page)
  await submitKeycloakLogin(page, accounts.laura.email)

  await expect(account(page)).toHaveAccessibleName(`Cuenta: ${accounts.laura.name}, Acme Studio`)
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible()

  const me = await (await page.request.get('/api/me')).json()
  expect(me.user.email).toBe(accounts.laura.email)
  // La cabecera de demostración no suplanta a nadie cuando la identidad viene del proveedor.
  const impersonation = await page.request.get('/api/me', { headers: { 'X-Demo-User': accounts.admin.email } })
  expect((await impersonation.json()).user.email).toBe(accounts.laura.email)
})

test('el JSESSIONID cambia tras el login (fijación de sesión)', async ({ page, context }) => {
  await openKeycloakLogin(page)
  // El flujo guardó la petición de autorización en una sesión anónima: ya hay cookie antes de autenticarse.
  const before = await sessionCookie(context)
  expect(before?.value, 'cookie de sesión previa al login').toBeTruthy()

  await submitKeycloakLogin(page, accounts.laura.email)
  await expect(account(page)).toBeVisible()

  const after = await sessionCookie(context)
  expect(after?.value, 'cookie de sesión tras el login').toBeTruthy()
  expect(after!.value).not.toBe(before!.value)
  expect(after!.httpOnly).toBe(true)
  // La sesión anterior ya no sirve: reutilizarla no entra.
  await context.addCookies([before!])
  expect((await page.request.get('/api/me')).status()).toBe(401)
})

test.describe('organizaciones', () => {
  // Jordi solo está en Northwind: el administrador de Acme lo invita para que tenga dos y la quita al terminar.
  test('cambia de organización cuando pertenece a dos', async ({ browser }) => {
    const adminContext = await browser.newContext()
    const admin = await adminContext.newPage()
    const jordiContext = await browser.newContext()
    const jordi = await jordiContext.newPage()
    let jordiUserId: string | undefined
    try {
      await signIn(admin, accounts.admin.email)
      const invited = await apiSend(admin, 'POST', '/members', {
        email: accounts.jordi.email,
        name: accounts.jordi.name,
        role: 'agent',
      })
      // 400 = ya era miembro de Acme por una ejecución anterior: el escenario no depende de un orden.
      expect([201, 400]).toContain(invited.status())
      const members = (await (await admin.request.get('/api/members')).json()) as { id: string; email: string }[]
      jordiUserId = members.find((member) => member.email === accounts.jordi.email)?.id
      expect(jordiUserId, 'Jordi figura en el equipo de Acme').toBeTruthy()

      await signIn(jordi, accounts.jordi.email)
      await account(jordi).click()
      const current = (await (await jordi.request.get('/api/me')).json()).organization.name as string
      const target = current === 'Acme Studio' ? 'Northwind Soporte' : 'Acme Studio'
      await jordi.getByRole('menuitem', { name: new RegExp(`^Cambiar de organización · ${current}`) }).click()
      const dialog = jordi.getByRole('dialog', { name: 'Cambiar de organización' })
      await dialog.getByRole('radio', { name: new RegExp(target) }).check()
      await dialog.getByRole('button', { name: 'Cambiar de organización' }).click()

      await expect(jordi.getByText(`Ahora trabajas en ${target}`)).toBeVisible()
      await expect(account(jordi)).toHaveAccessibleName(`Cuenta: ${accounts.jordi.name}, ${target}`)
      const me = await (await jordi.request.get('/api/me')).json()
      expect(me.organization.name).toBe(target)
      expect(me.organizations).toHaveLength(2)
    } finally {
      if (jordiUserId) await apiSend(admin, 'POST', `/members/${jordiUserId}/remove`, undefined)
      await adminContext.close()
      await jordiContext.close()
    }
  })
})

test('una escritura lleva el XSRF-TOKEN a la primera, sin reintento', async ({ page }) => {
  await signIn(page, accounts.laura.email)
  await page.goto('/configuracion/perfil')
  const name = page.getByRole('textbox', { name: 'Nombre' })
  await expect(name).toHaveValue(accounts.laura.name)

  // Todas las escrituras de la aplicación a /api/me, con su respuesta: un reintento por CSRF sería una segunda.
  const writes: { token: string | undefined; status: number }[] = []
  page.on('response', (response) => {
    const request = response.request()
    if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/me') {
      writes.push({ token: request.headers()['x-xsrf-token'], status: response.status() })
    }
  })

  const edited = `${accounts.laura.name} QA`
  try {
    await name.fill(edited)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados').first()).toBeVisible()
    expect(writes).toHaveLength(1)
    expect(writes[0].status).toBe(200)
    expect(writes[0].token, 'X-XSRF-TOKEN en la primera petición').toBeTruthy()
    expect(((await (await page.request.get('/api/me')).json()) as { user: { name: string } }).user.name).toBe(edited)
  } finally {
    // Deja el nombre como estaba para que el escenario se pueda repetir.
    await apiSend(page, 'PATCH', '/me', { name: accounts.laura.name })
  }
})

test('cerrar sesión termina la de la API y la de Keycloak: el siguiente «Entrar» pide la contraseña', async ({
  page,
  context,
}) => {
  await signIn(page, accounts.laura.email)
  expect((await page.request.get('/api/me')).status()).toBe(200)
  expect(await sessionCookie(context)).toBeDefined()

  await account(page).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  // Keycloak devuelve a la aplicación y, sin sesión, esta lleva a /entrar.
  await expect(page).toHaveURL(/\/entrar$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Entra a Resolve' })).toBeVisible()

  expect((await page.request.get('/api/me')).status()).toBe(401)
  expect(await sessionCookie(context), 'la cookie de sesión desaparece').toBeUndefined()

  // Sin SSO residual: el formulario de Keycloak pide usuario y contraseña otra vez.
  await page.getByRole('button', { name: 'Entrar con tu cuenta' }).click()
  await expect(page).toHaveURL(new RegExp(`${KEYCLOAK_AUTH_PATH}\\?`))
  await expect(page.locator('#username')).toBeVisible()
  await expect(page.locator('#password')).toBeVisible()
})

test.describe('cuenta desactivada', () => {
  // Pablo Núñez está retirado del equipo en los datos de demostración, pero no tiene cuenta en el realm: se crea aquí.
  const pablo = 'pablo.nunez@acme.example'
  test.beforeAll(() => ensureRealmUser(pablo, 'Pablo', 'Núñez'))
  test.afterAll(() => deleteRealmUser(pablo))

  test('ve el motivo en /entrar y puede cerrar sesión', async ({ page }) => {
    await openKeycloakLogin(page)
    await submitKeycloakLogin(page, pablo)

    await expect(page).toHaveURL(/\/entrar/)
    const alert = page.getByRole('alert').filter({ hasText: 'Esta cuenta no tiene acceso' })
    await expect(alert).toContainText('Tu acceso a esta organización fue desactivado')

    await page.getByRole('button', { name: 'Cerrar sesión y usar otra cuenta' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('alert').filter({ hasText: 'Esta cuenta no tiene acceso' })).toHaveCount(0)
    // La sesión terminó también en Keycloak.
    await page.getByRole('button', { name: 'Entrar con tu cuenta' }).click()
    await expect(page.locator('#password')).toBeVisible()
  })
})
