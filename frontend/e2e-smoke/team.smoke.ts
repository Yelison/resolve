import { expect, test } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: una invitación aparece como pendiente y pasa a activa en el primer acceso de la persona
 * invitada (el backend de demostración la activa al resolver su sesión).
 */
test('un administrador invita a un agente y lo ve pasar de invitado a activo', async ({ page, browser }) => {
  test.setTimeout(60_000)
  const stamp = Date.now()
  const name = `Agente Smoke ${stamp}`
  const email = `agente.smoke.${stamp}@acme.example`
  const notifications = page.getByRole('region', { name: 'Notificaciones' })
  const memberRow = () => page.getByRole('table', { name: 'Equipo' }).getByRole('row').filter({ hasText: email })

  await loginAs(page, demoUsers.admin)

  await test.step('invita a la persona y queda como invitación pendiente', async () => {
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    await dialog.getByRole('textbox', { name: 'Correo' }).fill(email)
    await dialog.getByRole('textbox', { name: 'Nombre' }).fill(name)
    await dialog.getByRole('button', { name: 'Invitar' }).click()

    await expect(notifications).toContainText('Invitación creada')
    await expect(memberRow()).toContainText(name)
    await expect(memberRow()).toContainText('Invitación pendiente')
  })

  await test.step('la persona invitada entra y su sesión es la de un agente', async () => {
    const context = await browser.newContext()
    try {
      const invited = await context.newPage()
      await loginAs(invited, email)
      const meResponse = invited.waitForResponse((response) => new URL(response.url()).pathname === '/api/me')
      await invited.goto('/tickets')
      const me = await meResponse
      expect(me.status(), 'GET /api/me de la persona invitada').toBe(200)
      expect(await me.json()).toMatchObject({ user: { email }, role: 'agent' })
    } finally {
      await context.close()
    }
  })

  await test.step('el administrador la ve activa', async () => {
    await page.reload()
    await expect(memberRow()).toContainText('Activo')
    await expect(memberRow()).not.toContainText('Invitación pendiente')
  })
})
