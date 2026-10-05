import { expect, test } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Recorrido completo contra el backend real (perfil `dev`, PostgreSQL) y el build `smoke`. A diferencia de `e2e/`,
 * nada está simulado: si el proxy, el contrato, la autenticación de demostración o la base fallan, esto falla.
 * Un solo flujo encadenado, porque cada paso depende del ticket que crea el anterior.
 */
test('un agente atiende un ticket y la clienta solo ve lo público', async ({ page, browser }) => {
  test.setTimeout(90_000)
  // Cada ejecución crea su propio asunto: no depende del orden ni de los datos que dejaron otras ejecuciones.
  const subject = `Smoke e2e ${Date.now()}`
  const reply = `Respuesta pública ${Date.now()}`
  const note = `Nota interna ${Date.now()}`
  const notifications = page.getByRole('region', { name: 'Notificaciones' })
  let number = ''

  await test.step('el agente crea un ticket para una clienta', async () => {
    await loginAs(page, demoUsers.admin)
    await page.goto('/tickets/nuevo')
    await page.getByRole('combobox', { name: 'Cliente' }).fill('María')
    await page.getByRole('option', { name: /María Pérez/ }).click()
    await page.getByRole('textbox', { name: 'Asunto' }).fill(subject)
    await page.getByRole('textbox', { name: 'Descripción' }).fill('Creado por la prueba full-stack de humo.')
    await page.getByRole('button', { name: 'Crear ticket' }).click()

    await expect(page).toHaveURL(/\/tickets\/\d+$/)
    number = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(subject)
    await expect(notifications).toContainText(`Ticket #${number} creado`)
  })

  await test.step('el ticket aparece en la bandeja al buscarlo', async () => {
    await page.goto('/tickets')
    await page.getByRole('searchbox', { name: 'Buscar tickets' }).fill(subject)
    const rows = page.getByRole('table', { name: 'Tickets' }).getByRole('row')
    await expect(rows).toHaveCount(2) // cabecera y el ticket
    await expect(page.getByRole('link', { name: new RegExp(subject) })).toBeVisible()
    await page.getByRole('link', { name: new RegExp(subject) }).click()
    await expect(page).toHaveURL(new RegExp(`/tickets/${number}$`))
  })

  await test.step('responde a la clienta y deja una nota interna', async () => {
    await page.getByRole('textbox', { name: 'Respuesta al cliente' }).fill(reply)
    await page.getByRole('button', { name: 'Enviar respuesta' }).click()
    await expect(notifications).toContainText('Respuesta enviada')
    await expect(page.getByText(reply)).toBeVisible()

    await page.getByRole('radio', { name: 'Nota interna' }).check({ force: true })
    await page.getByRole('textbox', { name: 'Nota interna' }).fill(note)
    await page.getByRole('button', { name: 'Guardar nota' }).click()
    await expect(notifications).toContainText('Nota guardada')
    await expect(page.getByText(note)).toBeVisible()
  })

  await test.step('cambia el estado y el historial lo registra', async () => {
    await page.getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'En progreso' })
    await expect(notifications).toContainText('Estado: En progreso')
    await page.getByRole('tab', { name: 'Historial' }).click()
    await expect(page.getByText('Yelisson Ortiz creó el ticket')).toBeVisible()
    await expect(page.getByText('Yelisson Ortiz cambió el estado a En progreso')).toBeVisible()
  })

  await test.step('la clienta ve la respuesta pero ni la nota ni los controles del equipo', async () => {
    // Contexto nuevo: sin la sesión del agente. Sin la cabecera X-Demo-User el backend la trataría como el agente
    // por defecto y vería los controles; ver la vista de cliente prueba que el build smoke la envía.
    const context = await browser.newContext()
    try {
      const customerPage = await context.newPage()
      await loginAs(customerPage, demoUsers.customer)
      await customerPage.goto(`/tickets/${number}`)
      await expect(customerPage.getByRole('heading', { level: 1 })).toHaveText(subject)
      await expect(customerPage.getByText(reply)).toBeVisible()
      await expect(customerPage.getByText(note)).toHaveCount(0)
      await expect(customerPage.getByRole('button', { name: 'Resolver ticket' })).toHaveCount(0)
      await expect(customerPage.getByRole('tab', { name: 'Historial' })).toHaveCount(0)
      await expect(customerPage.getByRole('textbox', { name: 'Respuesta al cliente' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
