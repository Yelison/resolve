import { expect, test } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: crear un cliente y usarlo enseguida en un ticket nuevo. Nombre y correo llevan la marca de
 * tiempo, así que la prueba no depende de lo que dejaron otras ejecuciones.
 */
test('un administrador crea un cliente y lo usa en un ticket nuevo', async ({ page }) => {
  test.setTimeout(60_000)
  const stamp = Date.now()
  const name = `Cliente Smoke ${stamp}`
  const subject = `Ticket del cliente smoke ${stamp}`
  const notifications = page.getByRole('region', { name: 'Notificaciones' })

  await loginAs(page, demoUsers.admin)

  await test.step('crea el cliente desde el diálogo de alta', async () => {
    await page.goto('/clientes/nuevo')
    const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' })
    await dialog.getByRole('textbox', { name: 'Nombre' }).fill(name)
    await dialog.getByRole('textbox', { name: 'Correo' }).fill(`smoke.${stamp}@cliente.example`)
    await dialog.getByRole('textbox', { name: 'Empresa' }).fill('Smoke S. A.')
    await dialog.getByRole('button', { name: 'Crear cliente' }).click()

    await expect(page).toHaveURL(/\/clientes\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(notifications).toContainText('Cliente creado')
  })

  await test.step('el cliente nuevo aparece en el selector del ticket y se crea el ticket', async () => {
    await page.goto('/tickets/nuevo')
    await page.getByRole('combobox', { name: 'Cliente' }).fill(name)
    await page.getByRole('option', { name: new RegExp(name) }).click()
    await page.getByRole('textbox', { name: 'Asunto' }).fill(subject)
    await page.getByRole('textbox', { name: 'Descripción' }).fill('Ticket de la prueba full-stack de clientes.')
    await page.getByRole('button', { name: 'Crear ticket' }).click()

    await expect(page).toHaveURL(/\/tickets\/\d+$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(subject)
  })

  await test.step('el ticket cuelga del cliente en su ficha', async () => {
    await page.goto('/clientes')
    await page.getByRole('searchbox', { name: /Buscar/ }).fill(name)
    await page.getByRole('link', { name }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('link', { name: new RegExp(subject) })).toBeVisible()
  })
})
