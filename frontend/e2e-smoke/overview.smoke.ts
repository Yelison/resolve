import { expect, test } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: un ticket urgente recién creado aparece en «Necesitan atención» del Resumen. La tabla es
 * un top 5 por prioridad, así que el ticket se crea urgente (entra aunque otras ejecuciones hayan dejado tickets
 * medios abiertos) y se resuelve al final para no ocupar un puesto en las ejecuciones siguientes.
 */
test('un ticket urgente nuevo aparece en «Necesitan atención» del Resumen', async ({ page }) => {
  test.setTimeout(90_000)
  const subject = `Smoke resumen ${Date.now()}`
  let number = ''

  await loginAs(page, demoUsers.admin)

  try {
    await test.step('crea un ticket urgente para una clienta', async () => {
      await page.goto('/tickets/nuevo')
      await page.getByRole('combobox', { name: 'Cliente' }).fill('María')
      await page.getByRole('option', { name: /María Pérez/ }).click()
      await page.getByRole('textbox', { name: 'Asunto' }).fill(subject)
      await page.getByRole('textbox', { name: 'Descripción' }).fill('Creado por la prueba full-stack del Resumen.')
      await page.getByRole('combobox', { name: 'Prioridad' }).selectOption({ label: 'Urgente' })
      await page.getByRole('button', { name: 'Crear ticket' }).click()
      await expect(page).toHaveURL(/\/tickets\/\d+$/)
      number = new URL(page.url()).pathname.split('/').pop()!
    })

    await test.step('el Resumen lo lista en «Necesitan atención» y enlaza a su detalle', async () => {
      await page.goto('/')
      const table = page.getByRole('table', { name: 'Tickets que necesitan atención' })
      const link = table.getByRole('link', { name: new RegExp(subject) })
      await expect(link).toBeVisible()
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/tickets/${number}$`))
    })
  } finally {
    // Resuelto: sale de «Necesitan atención» y deja libre el puesto. Si la creación falló no hay nada que cerrar.
    if (number) {
      await page.goto(`/tickets/${number}`)
      await page.getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'Resuelto' })
      await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Estado: Resuelto')
    }
  }

  await test.step('una vez resuelto ya no aparece en el Resumen', async () => {
    await page.goto('/')
    const table = page.getByRole('table', { name: 'Tickets que necesitan atención' })
    await expect(table).toBeVisible()
    // Solo la tabla: la actividad reciente sigue mencionando el ticket, y con razón.
    await expect(table.getByRole('link', { name: new RegExp(subject) })).toHaveCount(0)
  })
})
