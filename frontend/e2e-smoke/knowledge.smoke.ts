import { expect, test } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: el equipo escribe y publica un artículo público y una clienta lo encuentra y lo lee, con
 * lo que su sesión no tiene que ver (sin «Editar artículo» ni estado). El título lleva la marca de tiempo (el slug
 * sale de él y repetirlo daría un 409). Al terminar se despublica, así la lista pública de la demo no crece con cada
 * ejecución.
 */
test('el equipo publica un artículo y la clienta lo lee', async ({ page, browser }) => {
  test.setTimeout(90_000)
  const title = `Guía de humo ${Date.now()}`
  const text = `Texto de la guía ${Date.now()}.`
  const notifications = page.getByRole('region', { name: 'Notificaciones' })
  let editorUrl = ''

  await loginAs(page, demoUsers.admin)

  try {
    await test.step('el agente escribe el artículo, lo previsualiza y lo guarda como borrador', async () => {
      await page.goto('/conocimiento/nuevo')
      await page.getByRole('textbox', { name: 'Título' }).fill(title)
      await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
      await page.getByRole('textbox', { name: 'Contenido' }).fill(text)
      await page.getByRole('radio', { name: 'Clientes y equipo' }).check()
      await page.getByRole('tab', { name: 'Vista previa' }).click()
      await expect(page.getByText(text)).toBeVisible()
      await page.getByRole('tab', { name: 'Escribir' }).click()
      await page.getByRole('button', { name: 'Guardar borrador' }).click()
      await expect(page).toHaveURL(/\/conocimiento\/[^/]+\/editar$/)
      editorUrl = new URL(page.url()).pathname
    })

    await test.step('lo publica', async () => {
      await page.getByRole('button', { name: 'Publicar' }).click()
      await expect(notifications).toContainText('Artículo publicado')
      await expect(page.getByText('Publicado', { exact: true })).toBeVisible()
    })

    await test.step('la clienta lo encuentra en la lista y lo lee sin controles del equipo', async () => {
      // Contexto nuevo: la sesión del agente no puede colarse en la vista de la clienta.
      const context = await browser.newContext()
      try {
        const customerPage = await context.newPage()
        await loginAs(customerPage, demoUsers.customer)
        await customerPage.goto('/conocimiento')
        await customerPage.getByRole('link', { name: title }).click()
        await expect(customerPage).toHaveURL(editorUrl.replace(/\/editar$/, ''))
        await expect(customerPage.getByRole('heading', { level: 1, name: title })).toBeVisible()
        await expect(customerPage.getByText(text)).toBeVisible()
        await expect(customerPage.getByRole('link', { name: 'Editar artículo' })).toHaveCount(0)
        await expect(customerPage.getByText('Publicado', { exact: true })).toHaveCount(0)
      } finally {
        await context.close()
      }
    })
  } finally {
    if (editorUrl) {
      await page.goto(editorUrl)
      await page.getByRole('button', { name: 'Despublicar' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Despublicar' }).click()
      await expect(notifications).toContainText('Artículo despublicado')
    }
  }
})
