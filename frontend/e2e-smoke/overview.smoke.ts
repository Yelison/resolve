import { expect, test, type Page } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: un ticket urgente recién creado aparece en «Necesitan atención» de Inicio, con su motivo. El
 * servidor elige y ordena los 6 primeros del alcance, con los urgentes primero, así que el ticket se crea urgente (entra
 * aunque otras ejecuciones hayan dejado tickets medios abiertos) y se resuelve al final para no ocupar un puesto en las
 * ejecuciones siguientes. El ticket no tiene responsable, así que está en «Todo el equipo», no en «Para mí».
 */
async function teamList(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Todo el equipo/ }).click()
  return page.getByRole('list', { name: 'Tickets que necesitan atención' })
}

test('un ticket urgente nuevo aparece en «Necesitan atención» de Inicio', async ({ page }) => {
  test.setTimeout(90_000)
  const subject = `Smoke inicio ${Date.now()}`
  let number = ''

  await loginAs(page, demoUsers.admin)

  try {
    await test.step('crea un ticket urgente para una clienta', async () => {
      await page.goto('/tickets/nuevo')
      await page.getByRole('combobox', { name: 'Cliente' }).fill('María')
      await page.getByRole('option', { name: /María Pérez/ }).click()
      await page.getByRole('textbox', { name: 'Asunto' }).fill(subject)
      await page.getByRole('textbox', { name: 'Descripción' }).fill('Creado por la prueba full-stack de Inicio.')
      await page.getByRole('combobox', { name: 'Prioridad' }).selectOption({ label: 'Urgente' })
      await page.getByRole('button', { name: 'Crear ticket' }).click()
      await expect(page).toHaveURL(/\/tickets\/\d+$/)
      number = new URL(page.url()).pathname.split('/').pop()!
    })

    await test.step('Inicio lo lista en «Necesitan atención» y enlaza a su detalle', async () => {
      const list = await teamList(page)
      const link = list.getByRole('link', { name: new RegExp(subject) })
      await expect(link).toBeVisible()
      // El motivo viene del servidor: urgente manda sobre «sin respuesta» y «sin asignar», que también cumple.
      await expect(
        list.getByRole('listitem').filter({ hasText: subject }).getByText('Urgente', { exact: true }),
      ).toBeVisible()
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

  await test.step('una vez resuelto ya no aparece en Inicio', async () => {
    const list = await teamList(page)
    await expect(list).toBeVisible()
    // Solo la lista: la actividad reciente sigue mencionando el ticket, y con razón.
    await expect(list.getByRole('link', { name: new RegExp(subject) })).toHaveCount(0)
  })
})
