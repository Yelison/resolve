import type { Locator } from '@playwright/test'
import { articles, expect, mockApi, test } from './fixtures'

const longTitle = articles.find((article) => article.id === 'a-largo')!.title

/** Cabecera medida: `null` si no se pinta o queda reducida a 1 px solo para lectores de pantalla. */
async function headerWidth(table: Locator, name: string) {
  const header = table.getByRole('columnheader', { name }).first()
  const box = await header.boundingBox()
  return box && box.width > 1 ? box.width : null
}

test.describe('base de conocimiento', () => {
  test('el personal ve categorías, la tabla con estado y puede filtrar por categoría, búsqueda y borradores', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { level: 1, name: 'Base de conocimiento' })).toBeVisible()
    const table = page.getByRole('table', { name: 'Artículos' })
    await expect(table.getByRole('row')).toHaveCount(6) // encabezado + 5 artículos
    await expect(table.getByText('Borrador')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveAttribute('href', '/conocimiento/nuevo')

    await page.getByRole('button', { name: /Facturación/ }).click()
    await expect(page).toHaveURL(/category=facturacion/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByRole('link', { name: 'Descargar una factura' })).toHaveAttribute(
      'href',
      '/conocimiento/descargar-una-factura',
    )

    await page.getByRole('button', { name: /Facturación/ }).click()
    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Borradores' }).click()
    await expect(page).toHaveURL(/status=draft/)
    await expect(table.getByRole('row')).toHaveCount(2)

    await page.getByRole('searchbox', { name: 'Buscar artículos' }).fill('zzz')
    await expect(page.getByRole('heading', { name: 'No encontramos artículos' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(table.getByRole('row')).toHaveCount(6)
    await expect(page).toHaveURL(/\/conocimiento$/)
  })

  test('un cliente ve la sección en el menú y solo artículos publicados y públicos, sin estado ni «Nuevo artículo»', async ({
    page,
  }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Conocimiento' }),
    ).toBeVisible()
    const table = page.getByRole('table', { name: 'Artículos' })
    await expect(table.getByRole('row')).toHaveCount(4) // encabezado + 3 publicados y públicos
    await expect(page.getByText('Configurar notificaciones')).toHaveCount(0)
    await expect(page.getByText(longTitle)).toHaveCount(0)
    await expect(table.getByRole('columnheader', { name: 'Estado' })).toHaveCount(0)
    await expect(page.getByText('Borrador')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Estado' })).toHaveCount(0)
    // Una categoría sin artículos visibles no se muestra: «Primeros pasos» solo tiene uno público.
    await expect(page.getByRole('button', { name: /Primeros pasos/ })).toContainText('1 artículo')
  })

  test('una carga directa de /conocimiento pinta la shell con un esqueleto mientras llega el chunk, sin avisos', async ({
    page,
  }) => {
    const messages: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text())
    })
    page.on('pageerror', (error) => messages.push(error.message))
    // El chunk de la ruta queda retenido hasta que el test lo suelte.
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/assets/KnowledgePage-*.js', async (route) => {
      await released
      await route.continue()
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    const navigation = page.goto('/conocimiento')
    const main = page.locator('main#contenido')
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
    await expect(main).toBeVisible()
    await expect(main.getByText('Cargando…')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Artículos' })).toHaveCount(0)
    release()
    await navigation
    await expect(page.getByRole('table', { name: 'Artículos' })).toBeVisible()
    expect(messages).toEqual([])
  })

  test('una carga directa de /catalogo no avisa en la consola', async ({ page }) => {
    const messages: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text())
    })
    await page.goto('/catalogo')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(messages).toEqual([])
  })

  test('un cliente que abre /conocimiento/nuevo ve el aviso sin acceso', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.goto('/conocimiento/nuevo')
    await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible()
  })

  test('«Nuevo artículo» lleva a la página pendiente', async ({ page }) => {
    await page.goto('/conocimiento')
    await page.getByRole('link', { name: 'Nuevo artículo' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/nuevo$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo artículo' })).toBeVisible()
  })

  for (const sidebar of ['expandido', 'colapsado'] as const) {
    test(`a 1200 px con el sidebar ${sidebar} la tabla muestra la categoría como columna`, async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 900 })
      await page.goto('/conocimiento')
      if (sidebar === 'colapsado') await page.getByRole('button', { name: 'Colapsar menú' }).click()
      const table = page.getByRole('table', { name: 'Artículos' })
      await expect(table.getByRole('columnheader').first()).toBeVisible()
      expect(await headerWidth(table, 'Categoría'), 'Categoría debe verse').not.toBeNull()
    })
  }

  for (const width of [1024, 1100, 1199]) {
    test(`a ${width} px la categoría pasa bajo el título y no es columna`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/conocimiento')
      const table = page.getByRole('table', { name: 'Artículos' })
      await expect(table.getByRole('columnheader').first()).toBeVisible()
      expect(await headerWidth(table, 'Categoría')).toBeNull()
      await expect(table.getByRole('cell', { name: 'Cuenta y acceso' }).first()).toBeVisible()
    })
  }

  test('a 390 px las filas son tarjetas, el título largo se ve entero y no hay scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/conocimiento')
    const link = page.getByRole('link', { name: longTitle })
    await expect(link).toBeVisible()
    const box = (await link.boundingBox())!
    expect(box.height, 'el título envuelve en varias líneas').toBeGreaterThan(40)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
