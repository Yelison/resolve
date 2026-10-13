import type { Locator, Page } from '@playwright/test'
import { articles, createArticleStore, expect, mockApi, test } from './fixtures'

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const longTitle = articles.find((article) => article.id === 'a-largo')!.title

test.describe('base de conocimiento', () => {
  test('el personal ve la cabecera, las categorías, las tarjetas con extracto y puede filtrar por categoría, estado y búsqueda', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { level: 1, name: '¿Qué necesitas resolver?' })).toBeVisible()
    await expect(page.getByText('Busca en los 5 artículos de tu base de conocimiento')).toBeVisible()
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(5)
    await expect(cards.first()).toContainText('Si olvidaste tu contraseña')
    await expect(page.getByText('Borrador', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveAttribute('href', '/conocimiento/nuevo')
    // Las descripciones son las reales de la categoría, no un texto de relleno.
    await expect(page.getByText('Entrar, contraseñas y verificación en dos pasos')).toBeVisible()
    await expect(page.getByText(/^Descripción de /)).toHaveCount(0)
    // El recuento de resultados se ve una sola vez: el de la paginación.
    await expect(page.getByText(/^\d+–\d+ de \d+ resultados?$/)).toHaveCount(1)
    await expect(page.getByText(/^Mostrando \d+ resultados?$/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Publicados\s*4/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Borradores\s*1/ })).toBeVisible()

    await page.getByRole('link', { name: /Facturación/ }).click()
    await expect(page).toHaveURL(/category=facturacion/)
    await expect(cards).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Descargar una factura' })).toHaveAttribute(
      'href',
      '/conocimiento/descargar-una-factura',
    )

    await page.getByRole('link', { name: /Facturación/ }).click()
    await page.getByRole('button', { name: /Borradores/ }).click()
    await expect(page).toHaveURL(/status=draft/)
    await expect(cards).toHaveCount(1)

    await page.getByRole('searchbox', { name: 'Buscar artículos' }).fill('zzz')
    await expect(page.getByRole('heading', { name: 'No encontramos artículos' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(cards).toHaveCount(5)
    await expect(page).toHaveURL(/\/conocimiento$/)
  })

  test('un cliente ve la sección en el menú y solo artículos publicados y públicos, sin estado ni «Nuevo artículo»', async ({
    page,
  }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Ayuda' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(3) // los publicados y públicos
    await expect(page.getByRole('heading', { level: 1, name: '¿En qué podemos ayudarte?' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Temas' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Artículos más recientes' })).toBeVisible()
    // Solo en el contenido: el menú del cliente se llama «Mis solicitudes».
    await expect(page.getByRole('main').getByText(/solicitud/i)).toHaveCount(0)
    await expect(page.getByText('Configurar notificaciones')).toHaveCount(0)
    await expect(page.getByText(longTitle)).toHaveCount(0)
    await expect(page.getByText('Borrador')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Filtrar por estado' })).toHaveCount(0)
    // Una categoría sin artículos visibles no se muestra: «Primeros pasos» solo tiene uno público.
    await expect(page.getByRole('link', { name: /Primeros pasos/ })).toContainText('1 artículo')
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
    await expect(page.getByRole('article')).toHaveCount(0)
    release()
    await navigation
    await expect(page.getByRole('article').first()).toBeVisible()
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

  /** Columnas reales de una rejilla: cuántas pistas dibuja el navegador. */
  const columns = (list: Locator) =>
    list.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)

  for (const [width, categories, articles] of [
    [320, 1, 1],
    [390, 1, 1],
    [767, 1, 1],
    [768, 2, 2],
    [1024, 2, 2],
    [1199, 2, 2],
    [1200, 3, 2],
    [1440, 3, 2],
  ] as const) {
    test(`a ${width} px las categorías van en ${categories} columna(s) y los artículos en ${articles}, sin scroll horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/conocimiento')
      await expect(page.getByRole('article').first()).toBeVisible()
      expect(
        await columns(page.getByRole('list').filter({ has: page.getByRole('link', { name: /Cuenta y acceso/ }) })),
      ).toBe(categories)
      expect(await columns(page.getByRole('list').filter({ has: page.getByRole('article') }))).toBe(articles)
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('a 1200 px con el sidebar colapsado el contenido sigue sin desbordar', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto('/conocimiento')
    await page.getByRole('button', { name: 'Colapsar menú' }).click()
    await expect(page.getByRole('article').first()).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('a 320 px el buscador y su botón se apilan y a 1440 px van en la misma fila', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/conocimiento')
    const field = page.getByRole('searchbox', { name: 'Buscar artículos' })
    const button = page.getByRole('search').getByRole('button', { name: 'Buscar' })
    const [narrowField, narrowButton] = [(await field.boundingBox())!, (await button.boundingBox())!]
    expect(narrowButton.y).toBeGreaterThanOrEqual(narrowField.y + narrowField.height)
    expect(narrowButton.height).toBeGreaterThanOrEqual(44)
    await page.setViewportSize({ width: 1440, height: 900 })
    const [wideField, wideButton] = [(await field.boundingBox())!, (await button.boundingBox())!]
    expect(Math.abs(wideButton.y - wideField.y)).toBeLessThan(wideField.height)
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 390]) {
      test(`el campo del buscador mide lo que «Buscar» y su texto escrito se lee sobre el campo · ${theme} · ${width}px`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/conocimiento')
        const field = page.getByRole('searchbox', { name: 'Buscar artículos' })
        const button = page.getByRole('search').getByRole('button', { name: 'Buscar' })
        await field.fill('recuperar contraseña')
        const [fieldBox, buttonBox] = [(await field.boundingBox())!, (await button.boundingBox())!]
        expect(fieldBox.height).toBeCloseTo(buttonBox.height, 0)
        // La caja es el propio campo: su contenedor no pinta nada debajo ni lo supera.
        const container = await field.evaluate((input) => {
          const box = input.parentElement!.parentElement!
          return { height: box.getBoundingClientRect().height, background: getComputedStyle(box).backgroundColor }
        })
        expect(container.height).toBeCloseTo(fieldBox.height, 0)
        expect(container.background).toBe('rgba(0, 0, 0, 0)')
        // El hero pone texto claro: el campo (`--color-surface`) no debe heredarlo.
        const ratio = await field.evaluate((input) => {
          const channels = (value: string) =>
            value
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
          const luminance = ([r, g, b]: number[]) => {
            const [lr, lg, lb] = [r, g, b].map((v) => {
              const c = v! / 255
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            })
            return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!
          }
          const style = getComputedStyle(input)
          const [a, b] = [luminance(channels(style.color)), luminance(channels(style.backgroundColor))]
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        })
        expect(ratio, 'contraste del texto escrito').toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  test('un nombre de categoría y un título de 120 caracteres sin espacios no se recortan ni desbordan', async ({
    page,
  }) => {
    const long = 'L'.repeat(120)
    const articleStore = createArticleStore()
    const seed = articleStore.get('configurar-notificaciones')!
    articleStore.set(seed.slug, { ...seed, title: long, status: 'published' })
    await mockApi(page, 'admin', { articleStore })
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/conocimiento')
      const link = page.getByRole('link', { name: long })
      await expect(link).toBeVisible()
      expect(await noHorizontalOverflow(page), `a ${width} px`).toBeLessThanOrEqual(0)
      const box = (await link.boundingBox())!
      expect(box.x + box.width, `a ${width} px`).toBeLessThanOrEqual(width)
    }
  })

  test('el extracto ocupa dos líneas como máximo pero su texto completo sigue en la página', async ({ page }) => {
    const sentence = 'Una frase bastante larga que no cabe en dos líneas de una tarjeta estrecha. '
    const articleStore = createArticleStore()
    const seed = articleStore.get('invitar-a-tu-equipo')!
    articleStore.set(seed.slug, { ...seed, body: sentence.repeat(2).trim() })
    await mockApi(page, 'admin', { articleStore })
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/conocimiento')
    const excerpt = page.getByRole('article').filter({ hasText: 'Invitar a tu equipo' }).locator('p[title]')
    await expect(excerpt).toHaveText(/Una frase bastante larga.*Una frase bastante larga/)
    const lines = await excerpt.evaluate((element) => {
      const style = getComputedStyle(element)
      return element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)
    })
    expect(lines).toBeLessThanOrEqual(2.01)
  })

  test('por debajo de 768 px los controles de la lista miden 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/conocimiento')
    await expect(page.getByRole('article').first()).toBeVisible()
    const controls = [
      page.getByRole('link', { name: /Cuenta y acceso/ }),
      page.getByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' }),
      page.getByRole('button', { name: /Publicados/ }),
      page.getByRole('button', { name: /Borradores/ }),
      page.getByRole('link', { name: 'Nuevo artículo' }),
      page.getByRole('search').getByRole('button', { name: 'Buscar' }),
    ]
    for (const control of controls) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    }
  })

  test('con más de seis categorías «Ver las N categorías» despliega el resto en la misma página y la URL lo recuerda', async ({
    page,
  }) => {
    const extra = Array.from({ length: 9 }, (_, index) => ({
      id: `c${index}`,
      name: `Tema ${index + 1}`,
      slug: `tema-${index + 1}`,
      description: `Sobre el tema ${index + 1}`,
      articles: index + 10,
    }))
    await page.route('**/api/knowledge/categories', (route) => route.fulfill({ json: extra }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    const topic = (n: number) => page.getByRole('link', { name: new RegExp(`Tema ${n}\\b`) })
    await expect(topic(9)).toBeVisible()
    await expect(topic(4)).toBeVisible()
    await expect(topic(3)).toHaveCount(0)
    await page.getByRole('button', { name: 'Ver las 9 categorías' }).click()
    await expect(page).toHaveURL(/categories=all/)
    await expect(topic(1)).toBeVisible()
    await page.reload()
    await expect(topic(1)).toBeVisible()
    await page.getByRole('button', { name: 'Ver menos' }).click()
    await expect(page).not.toHaveURL(/categories=all/)
    await expect(topic(1)).toHaveCount(0)
  })

  test('sin artículos el personal ve la llamada a crear el primero y un cliente no', async ({ page }) => {
    await page.route('**/api/knowledge/articles*', (route) =>
      route.fulfill({ json: { items: [], page: 0, size: 10, totalItems: 0, totalPages: 0 } }),
    )
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { name: 'Todavía no hay artículos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveCount(2)
    await mockApi(page, 'customer')
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { name: 'Todavía no hay artículos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nuevo artículo' })).toHaveCount(0)
  })

  test('un error en la lista se anuncia, ofrece reintentar y no oculta las categorías', async ({ page }) => {
    let fail = true
    await page.route('**/api/knowledge/articles*', async (route) => {
      if (fail) return route.fulfill({ status: 500, json: { status: 500, title: 'Error' } })
      return route.fallback()
    })
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { name: 'No pudimos cargar los artículos' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Cuenta y acceso/ })).toBeVisible()
    fail = false
    await page.getByRole('button', { name: 'Reintentar cargar los artículos' }).click()
    await expect(page.getByRole('article').first()).toBeVisible()
  })

  test('un 403 en la lista dice que no hay permisos', async ({ page }) => {
    await page.route('**/api/knowledge/articles*', (route) =>
      route.fulfill({ status: 403, json: { status: 403, title: 'Prohibido' } }),
    )
    await page.goto('/conocimiento')
    await expect(page.getByRole('heading', { name: 'No tienes acceso a estos artículos' })).toBeVisible()
  })

  test('al llegar los datos el contenido de debajo no se mueve (primera carga)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/knowledge/categories', async (route) => {
      await released
      await route.fallback()
    })
    await page.goto('/conocimiento')
    const articlesHeading = page.getByRole('heading', { level: 2, name: 'Artículos' })
    await expect(articlesHeading).toBeVisible()
    const before = (await articlesHeading.boundingBox())!.y
    release()
    await expect(page.getByRole('link', { name: /Cuenta y acceso/ })).toBeVisible()
    await expect(page.getByRole('article').first()).toBeVisible()
    const after = (await articlesHeading.boundingBox())!.y
    // La línea de apoyo, las tarjetas de categoría y los botones del personal reservan su altura real mientras cargan.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1)
  })

  test('el teclado alcanza el buscador, las categorías, las píldoras y los artículos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento')
    await expect(page.getByRole('article').first()).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar artículos' }).focus()
    const reached: string[] = []
    for (let step = 0; step < 14; step++) {
      await page.keyboard.press('Tab')
      reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30) ?? ''))
    }
    expect(reached.join('|')).toContain('Buscar')
    expect(reached.join('|')).toContain('Cuenta y acceso')
    expect(reached.join('|')).toContain('Publicados')
    expect(reached.join('|')).toContain('Cómo recuperar el acceso')
  })
})
const SLUG = 'como-recuperar-el-acceso-a-tu-cuenta'

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
      // Cerrado, el panel mide el resumen más su relleno (44 + 2 × 16 + 2 de borde), sin hueco extra bajo el resumen.
      expect((await page.locator('details').boundingBox())!.height).toBeLessThanOrEqual(44 + 32 + 2 + 1)
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
    await expect(page.getByText('Contacta con el equipo de soporte de tu espacio.')).toBeVisible()
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

  test('crea, previsualiza y publica un artículo y un cliente lo encuentra y lo lee', async ({ page }) => {
    // El estado se comparte entre la sesión del equipo y la del cliente, como el servidor entre las dos personas.
    const articleStore = createArticleStore()
    await mockApi(page, 'admin', { articleStore })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/conocimiento/nuevo')
    await page.getByRole('textbox', { name: 'Título' }).fill('Cambiar tu contraseña')
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
    await page.getByRole('textbox', { name: 'Contenido' }).fill('Primero entra a tu perfil.')
    await page.getByRole('radio', { name: 'Clientes y equipo' }).check()

    await page.getByRole('tab', { name: 'Vista previa' }).click()
    await expect(page.getByText('Primero entra a tu perfil.')).toBeVisible()
    await page.getByRole('tab', { name: 'Escribir' }).click()
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/cambiar-tu-contrasena\/editar$/)

    // Un borrador no lo ve el cliente: la lista y el enlace directo responden como si no existiera.
    await mockApi(page, 'customer', { articleStore })
    await page.goto('/conocimiento')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cambiar tu contraseña' })).toHaveCount(0)

    await mockApi(page, 'admin', { articleStore })
    await page.goto('/conocimiento/cambiar-tu-contrasena/editar')
    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('Artículo publicado')).toBeVisible()

    await mockApi(page, 'customer', { articleStore })
    await page.goto('/conocimiento')
    await page.getByRole('link', { name: 'Cambiar tu contraseña' }).click()
    await expect(page).toHaveURL(/\/conocimiento\/cambiar-tu-contrasena$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Cambiar tu contraseña' })).toBeVisible()
    await expect(page.getByText('Primero entra a tu perfil.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar artículo' })).toHaveCount(0)
    await expect(page.getByText('Publicado', { exact: true })).toHaveCount(0)
  })

  test('un artículo publicado solo para el equipo no llega al cliente', async ({ page }) => {
    const articleStore = createArticleStore()
    await mockApi(page, 'admin', { articleStore })
    await page.goto('/conocimiento/nuevo')
    await page.getByRole('textbox', { name: 'Título' }).fill('Guía interna de escalado')
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
    await page.getByRole('textbox', { name: 'Contenido' }).fill('Solo para el equipo.')
    await page.getByRole('radio', { name: 'Solo el equipo' }).check()
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page).toHaveURL(/\/guia-interna-de-escalado\/editar$/)
    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('Publicado', { exact: true })).toBeVisible()

    await mockApi(page, 'customer', { articleStore })
    await page.goto('/conocimiento')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Guía interna de escalado' })).toHaveCount(0)
    await page.goto('/conocimiento/guia-interna-de-escalado')
    await expect(page.getByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeVisible()
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

  test('el teclado recorre la barra con flechas y el diálogo de despublicar no deja salir el foco con Tab y cierra con Escape', async ({
    page,
  }) => {
    await page.goto(`/conocimiento/${SLUG}/editar`)
    await page.getByRole('button', { name: 'Encabezado' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('button', { name: 'Negrita' })).toBeFocused()
    await page.getByRole('button', { name: 'Despublicar' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Despublicar este artículo?' })
    await expect(dialog).toBeVisible()
    // El diálogo es modal nativo: con Tab y Mayús + Tab el foco nunca llega al contenido de detrás. Al pasar del último
    // control al primero hace una parada en la interfaz del navegador (`body`), así que se acepta el diálogo o `body`.
    const seen = new Set<string>()
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      const where = await dialog.evaluate((element) =>
        element.contains(document.activeElement)
          ? `dentro: ${document.activeElement?.textContent}`
          : document.activeElement === document.body
            ? 'navegador'
            : `fuera: ${document.activeElement?.tagName}`,
      )
      seen.add(where)
      expect(where).not.toMatch(/^fuera/)
    }
    expect([...seen].some((where) => where.startsWith('dentro'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
