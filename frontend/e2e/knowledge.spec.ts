import type { Locator, Page } from '@playwright/test'
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

  for (const route of [`/conocimiento/como-recuperar-el-acceso-a-tu-cuenta`, '/conocimiento/nuevo']) {
    test(`una carga directa de ${route} pinta la shell y no avisa en la consola`, async ({ page }) => {
      const messages: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text())
      })
      page.on('pageerror', (error) => messages.push(error.message))
      await page.goto(route)
      await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(messages).toEqual([])
    })
  }

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

  test('«Nuevo artículo» abre el editor', async ({ page }) => {
    await page.goto('/conocimiento')
    await page.getByRole('link', { name: 'Nuevo artículo' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/nuevo$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo artículo' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Título' })).toBeVisible()
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

const SLUG = 'como-recuperar-el-acceso-a-tu-cuenta'

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('lectura de un artículo', () => {
  test('a 1440 px el texto mide a lo sumo 720 px y el índice es un panel lateral que lleva al encabezado', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/conocimiento/${SLUG}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })).toBeVisible()
    const heading = page.getByRole('heading', { level: 2, name: 'Recupera el acceso' })
    const paragraph = page.getByRole('article').getByText('Busca el mensaje de recuperación.')
    expect((await paragraph.boundingBox())!.width).toBeLessThanOrEqual(720)
    // Panel lateral: sin <details> y a la derecha del artículo.
    await expect(page.locator('details')).toHaveCount(0)
    const outline = page.getByRole('navigation', { name: 'En este artículo' })
    const card = (await page.getByRole('article').boundingBox())!
    expect((await outline.boundingBox())!.x).toBeGreaterThan(card.x + card.width)
    await outline.getByRole('link', { name: 'Recupera el acceso' }).click()
    await expect(heading).toBeFocused()
    await expect(heading).toBeInViewport()
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('con poca altura el lateral fijo se desplaza por dentro: el último enlace y «¿Necesitas ayuda?» se alcanzan', async ({
    page,
  }) => {
    const headings = Array.from(
      { length: 14 },
      (_, index) => `${index + 1}. Un encabezado bastante largo sobre un paso concreto`,
    )
    const body = headings.flatMap((heading) => [`## ${heading}`, '', 'Texto del paso.', '']).join('\n')
    await page.route('**/api/knowledge/articles/guia-larga', (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { ETag: '"1"' },
        body: JSON.stringify({
          id: 'a-guia-larga',
          slug: 'guia-larga',
          title: 'Una guía larga',
          category: { id: 'cat-acceso', name: 'Cuenta y acceso', slug: 'cuenta-y-acceso' },
          status: 'published',
          visibility: 'public',
          updatedAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
          body,
          allowFeedback: true,
          version: 1,
          createdBy: { id: 'u-admin', name: 'Yelisson Ortiz' },
          updatedBy: { id: 'u-admin', name: 'Yelisson Ortiz' },
        }),
      }),
    )
    await page.setViewportSize({ width: 1440, height: 700 })
    await page.goto('/conocimiento/guia-larga')
    await expect(page.getByRole('heading', { level: 1, name: 'Una guía larga' })).toBeVisible()
    const side = page.getByRole('complementary', { name: 'Ayuda del artículo' })
    // Alto máximo = viewport − barra de 72 px − 2 × 24 px de margen; más contenido que eso se desplaza por dentro.
    expect((await side.boundingBox())!.height, 'el lateral no es más alto que el viewport visible').toBeLessThanOrEqual(
      580,
    )
    expect(
      await side.evaluate((element) => element.scrollHeight > element.clientHeight),
      'hay desbordamiento interno',
    ).toBe(true)
    // Con la página desplazada, el lateral queda fijo bajo la barra superior.
    await page.evaluate(() => window.scrollTo(0, 400))
    // Se desplaza por dentro: tras recorrerlo, el último enlace y la ayuda se ven completos.
    await side.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    const last = page.getByRole('navigation', { name: 'En este artículo' }).getByRole('link').last()
    await expect(last).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('heading', { name: '¿Necesitas ayuda?' })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('link', { name: 'Crear un ticket' })).toBeInViewport({ ratio: 1 })
  })

  for (const width of [390, 1024]) {
    test(`a ${width} px el índice se pliega encima del texto y no hay scroll horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/conocimiento/${SLUG}`)
      const summary = page.getByText('En este artículo', { exact: true })
      await expect(summary).toBeVisible()
      const links = page.getByRole('navigation', { name: 'En este artículo' }).getByRole('link')
      await expect(links.first()).toBeHidden()
      await summary.click()
      await expect(links.first()).toBeVisible()
      await links.nth(2).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Recupera el acceso' })).toBeFocused()
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('el personal ve el estado, «Editar artículo» y el aviso de borrador', async ({ page }) => {
    await page.goto('/conocimiento/configurar-notificaciones')
    await expect(page.getByText('Borrador: los clientes no lo ven')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar artículo' })).toHaveAttribute(
      'href',
      '/conocimiento/configurar-notificaciones/editar',
    )
    await expect(page.getByRole('link', { name: 'Crear un ticket' })).toHaveAttribute('href', '/tickets/nuevo')
  })

  test('un cliente lee un publicado sin acciones de personal y recibe 404 en un borrador', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.goto(`/conocimiento/${SLUG}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar artículo' })).toHaveCount(0)
    await expect(page.getByText('Publicado', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Contacta con el equipo de soporte de tu organización.')).toBeVisible()
    await page.goto('/conocimiento/configurar-notificaciones')
    await expect(page.getByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeVisible()
  })

  test('un cliente que abre el editor ve el aviso sin acceso', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.goto(`/conocimiento/${SLUG}/editar`)
    await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Título' })).toHaveCount(0)
  })
})

test.describe('editor de artículos', () => {
  test('crea un borrador, lo previsualiza, lo publica y lo despublica con confirmación', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento/nuevo')
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByRole('textbox', { name: 'Título' })).toBeFocused()
    await expect(page.getByText('Elige una categoría.')).toBeVisible()

    await page.getByRole('textbox', { name: 'Título' }).fill('Cambiar tu contraseña')
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
    const body = page.getByRole('textbox', { name: 'Contenido' })
    await body.fill('Primero entra a tu perfil.')
    await page.getByRole('button', { name: 'Encabezado' }).click()
    await expect(body).toHaveValue('## Primero entra a tu perfil.')
    await expect(page.getByText('Borrador guardado en este navegador')).toBeVisible()

    await page.getByRole('tab', { name: 'Vista previa' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Primero entra a tu perfil.' })).toBeVisible()
    await page.getByRole('tab', { name: 'Escribir' }).click()

    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/cambiar-tu-contrasena\/editar$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Editar artículo' })).toBeVisible()
    await expect(page.getByText('Borrador', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('Artículo publicado')).toBeVisible()
    await expect(page.getByText('Publicado', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Despublicar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Despublicar' }).click()
    await expect(page.getByText('Artículo despublicado')).toBeVisible()
    await expect(page.getByText('Borrador', { exact: true })).toBeVisible()
  })

  test('«Nuevo artículo» no se abre con el texto de un borrador ya guardado', async ({ page }) => {
    await page.goto('/conocimiento/nuevo')
    await page.getByRole('textbox', { name: 'Título' }).fill('Primer intento')
    await page.getByRole('textbox', { name: 'Contenido' }).fill('Texto')
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Facturación' })
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page).toHaveURL(/\/editar$/)
    await page.goto('/conocimiento/nuevo')
    await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'Contenido' })).toHaveValue('')
  })

  test('recargar conserva lo escrito en el navegador', async ({ page }) => {
    await page.goto('/conocimiento/nuevo')
    await page.getByRole('textbox', { name: 'Título' }).fill('A medias')
    await page.getByRole('textbox', { name: 'Contenido' }).fill('Sin guardar')
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('A medias')
    await expect(page.getByRole('textbox', { name: 'Contenido' })).toHaveValue('Sin guardar')
  })

  for (const [width, panelBelow] of [
    [320, true],
    [390, true],
    [767, true],
    [768, true],
    [1024, true],
    [1199, true],
    [1200, false],
    [1440, false],
  ] as const) {
    test(`a ${width} px el panel de publicación va ${panelBelow ? 'debajo' : 'al lado'} y no hay scroll horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/conocimiento/${SLUG}/editar`)
      const form = page.locator('form')
      await expect(form).toBeVisible()
      const panel = page.getByRole('region', { name: 'Publicación' })
      const formBox = (await form.boundingBox())!
      const panelBox = (await panel.boundingBox())!
      if (panelBelow) expect(panelBox.y).toBeGreaterThanOrEqual(formBox.y + formBox.height)
      else expect(panelBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width)
      // La barra del editor envuelve: todos sus botones caben dentro del formulario.
      const toolbar = page.getByRole('toolbar', { name: 'Formato' })
      for (const button of await toolbar.getByRole('button').all()) {
        const box = (await button.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(formBox.x + formBox.width)
        if (width < 768) expect(box.height).toBeGreaterThanOrEqual(44 - 1)
      }
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('el teclado recorre la barra con flechas y el diálogo de despublicar atrapa el foco y cierra con Escape', async ({
    page,
  }) => {
    await page.goto(`/conocimiento/${SLUG}/editar`)
    await page.getByRole('button', { name: 'Encabezado' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('button', { name: 'Negrita' })).toBeFocused()
    await page.getByRole('button', { name: 'Despublicar' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Despublicar este artículo?' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
