import type { Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'

const desktop = { width: 1440, height: 900 }
const phone = { width: 390, height: 844 }

/** El sidebar no es un landmark: se llega a él desde su navegación principal. */
const sidebarOf = (page: Page) => page.getByRole('navigation', { name: 'Principal' }).locator('..')
const sections = (page: Page) => page.getByRole('navigation', { name: 'Secciones de configuración' })
const saveBar = (page: Page) => page.getByRole('button', { name: 'Guardar cambios' }).locator('xpath=../..')

test.describe('configuración: navegación', () => {
  test('/configuracion abre Empresa y la sección vive en la URL, con Atrás entre secciones', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion\/empresa$/)
    await expect(sections(page).getByRole('link')).toHaveText([/Empresa/, /Permisos/, /General/, /Tus espacios/])
    await expect(sections(page).getByRole('link', { name: /Empresa/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('tab')).toHaveCount(0)

    await sections(page)
      .getByRole('link', { name: /Permisos/ })
      .click()
    await expect(page).toHaveURL(/\/configuracion\/permisos$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/configuracion\/empresa$/)
  })

  test('con teclado se llega a cada sección y se abre con Enter', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await sections(page)
      .getByRole('link', { name: /General/ })
      .focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/configuracion\/general$/)
    await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible()
  })

  for (const [from, to] of [
    ['perfil', 'general'],
    ['apariencia', 'general'],
    ['roles', 'permisos'],
  ] as const) {
    test(`/configuracion/${from} redirige a /configuracion/${to}`, async ({ page }) => {
      await page.setViewportSize(desktop)
      await page.goto(`/configuracion/${from}`)
      await expect(page).toHaveURL(new RegExp(`/configuracion/${to}$`))
    })
  }

  test('en la frontera de 768 px: lista a 767 y columna lateral a 768', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 })
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Espacio' })).toBeVisible()
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion\/empresa$/)
    await expect(sections(page)).toBeVisible()
    const nav = await sections(page).boundingBox()
    const content = await page.getByRole('textbox', { name: 'Nombre del espacio' }).boundingBox()
    // La navegación queda a la izquierda del contenido, no encima.
    expect(nav!.x + nav!.width).toBeLessThanOrEqual(content!.x)
  })

  test('en móvil la lista tiene el estado de General y cada sección es su pantalla con «‹ Configuración»', async ({
    page,
  }) => {
    await page.setViewportSize(phone)
    await page.goto('/configuracion')
    await expect(page.getByText('Yelisson Ortiz · tema como el sistema')).toBeVisible()
    await page.getByRole('link', { name: /^Empresa/ }).click()
    await expect(page).toHaveURL(/\/configuracion\/empresa$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Empresa' })).toBeVisible()
    await page.getByRole('link', { name: 'Configuración' }).click()
    await expect(page).toHaveURL(/\/configuracion$/)
    await page.getByRole('link', { name: /^General/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'General' })).toBeVisible()
  })
})

test.describe('configuración: Empresa', () => {
  test('el administrador guarda la empresa: el sidebar cambia y el formulario vuelve a estar limpio', async ({
    page,
  }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const save = page.getByRole('button', { name: 'Guardar cambios' })
    await expect(save).toBeDisabled()
    await expect(page.getByText('Sin cambios.')).toBeVisible()
    await expect(page.getByText('Ahora respondes en 18 min.')).toBeVisible()

    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')
    await expect(page.getByText('Tienes cambios sin guardar en «Nombre del espacio».')).toBeVisible()
    await page.getByRole('combobox', { name: 'Zona horaria' }).selectOption('Europe/Madrid')
    await page.getByRole('textbox', { name: 'Objetivo de primera respuesta' }).fill('45')
    await expect(
      page.getByText(
        'Tienes cambios sin guardar en «Nombre del espacio», «Zona horaria» y «Objetivo de primera respuesta».',
      ),
    ).toBeVisible()
    await save.click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Acme Studio SL')).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'Identidad', level: 2 })).toBeFocused()

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('Europe/Madrid')
    await expect(page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })).toHaveValue('45')
  })

  test('el color: se elige con teclado, la vista previa y la barra lateral siguen, y se guarda con «Guardar cambios»', async ({
    page,
  }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const group = page.getByRole('group', { name: 'Color del espacio' })
    await expect(group.getByRole('radio')).toHaveCount(8)
    await expect(group.getByRole('radio', { name: 'Azul' })).toBeChecked()
    await group.getByRole('radio', { name: 'Azul' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'Verde' })).toBeChecked()
    await expect(page.getByText('Color: Verde')).toBeVisible()
    await expect(page.getByText('Tienes cambios sin guardar en «Color».')).toBeVisible()
    // El anillo y el check marcan la elegida, no solo el tono.
    const checkOf = (name: string) => group.locator('label', { has: page.getByRole('radio', { name }) }).locator('svg')
    await expect(checkOf('Verde')).toHaveCSS('opacity', '1')
    await expect(checkOf('Azul')).toHaveCSS('opacity', '0')
    const mark = sidebarOf(page).getByText('AS').first()
    const before = await mark.evaluate((node) => getComputedStyle(node).backgroundColor)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    // Sin recargar, la barra lateral toma el color nuevo.
    await expect.poll(() => mark.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(before)
    await page.reload()
    await expect(page.getByRole('radio', { name: 'Verde' })).toBeChecked()
  })

  test('el color: cada muestra mide 44 px, tiene foco visible y «Descartar» deja el foco en la marcada', async ({
    page,
  }) => {
    await page.setViewportSize(phone)
    await page.goto('/configuracion/empresa')
    const group = page.getByRole('group', { name: 'Color del espacio' })
    for (const radio of await group.getByRole('radio').all()) {
      const box = (await radio.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await group.getByRole('radio', { name: 'Azul' }).focus()
    await page.keyboard.press('ArrowRight')
    const chip = group
      .locator('label', { has: page.getByRole('radio', { name: 'Verde' }) })
      .locator('span')
      .first()
    expect(await chip.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none')
    await page.getByRole('button', { name: 'Descartar' }).click()
    await expect(group.getByRole('radio', { name: 'Azul' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'Azul' })).toBeFocused()
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 767, 768, 1024, 1199, 1200, 1440]) {
      test(`el color: sin scroll horizontal ni recortes con un nombre de 120 caracteres · ${theme} · ${width}px`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/configuracion/empresa')
        await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('N'.repeat(120))
        const group = page.getByRole('group', { name: 'Color del espacio' })
        await expect(group).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        for (const radio of await group.getByRole('radio').all()) {
          const box = (await radio.boundingBox())!
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
        }
      })
    }
  }

  test('la API simulada rechaza con un 400 una clave de color desconocida y acepta las del contrato', async ({
    page,
  }) => {
    await page.goto('/configuracion/empresa')
    const patch = (color: string) =>
      page.evaluate(async (value) => {
        const current = await fetch('/api/organization')
        const response = await fetch('/api/organization', {
          method: 'PATCH',
          headers: { 'If-Match': current.headers.get('ETag')!, 'Content-Type': 'application/merge-patch+json' },
          body: JSON.stringify({ color: value }),
        })
        return { status: response.status, body: await response.json() }
      }, color)
    const rejected = await patch('fucsia')
    expect(rejected.status).toBe(400)
    expect(rejected.body.errors).toEqual([expect.objectContaining({ field: 'color' })])
    expect((await patch('slate')).status).toBe(200)
  })

  test('la zona se lee con el nombre de la ciudad y su desfase', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await expect(page.getByRole('combobox', { name: 'Zona horaria' })).toContainText('Bogotá (GMT−5)')
  })

  test('«Descartar» devuelve lo guardado y deja el foco en el campo', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const name = page.getByRole('textbox', { name: 'Nombre del espacio' })
    await name.fill('Otro nombre')
    await page.getByRole('button', { name: 'Descartar' }).click()
    await expect(name).toHaveValue('Acme Studio')
    await expect(name).toBeFocused()
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })

  test('valida en el cliente y muestra los errores del servidor en su campo', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const name = page.getByRole('textbox', { name: 'Nombre del espacio' })
    await name.fill('')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Escribe el nombre del espacio.')).toBeVisible()
    await expect(name).toBeFocused()

    await name.fill('Acme Studio')
    const zone = page.getByRole('combobox', { name: 'Zona horaria' })
    await zone.selectOption('Pacific/Honolulu')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Zona horaria no reconocida por el servidor.')).toBeVisible()
    await expect(zone).toHaveAttribute('aria-invalid', 'true')
  })

  test('un 412 conserva lo escrito y reintenta con la versión nueva', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')

    // Otra persona cambia el correo de soporte mientras tanto.
    await page.evaluate(() =>
      fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'If-Match': '"3"', 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({ supportEmail: 'otra@acme.example' }),
      }),
    )
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Los ajustes cambiaron mientras los editabas')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveValue('Acme Studio SL')
    await expect(page.getByRole('textbox', { name: 'Correo de soporte' })).toHaveValue('otra@acme.example')

    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Acme Studio SL')).toBeVisible()
  })

  test('un 412 desde la barra, con el formulario desplazado, deja el aviso a la vista', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/configuracion/empresa')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')
    await page.evaluate(() =>
      fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'If-Match': '"3"', 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({ supportEmail: 'otra@acme.example' }),
      }),
    )
    await page.getByRole('textbox', { name: 'Objetivo de primera respuesta' }).focus()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'Los ajustes cambiaron mientras los editabas' })
    await expect(notice).toBeInViewport()
    // A la vista de verdad: por debajo de la barra superior, que es pegajosa, y no tapado por ella.
    await expect
      .poll(async () => {
        const topbar = (await page.locator('header').first().boundingBox())!
        const box = (await notice.boundingBox())!
        return box.y - (topbar.y + topbar.height)
      })
      .toBeGreaterThanOrEqual(0)
  })

  test('un nombre de espacio de 120 caracteres no desborda la página en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/configuracion/empresa')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('N'.repeat(120))
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    for (const path of ['empresa', 'permisos', 'general']) {
      await page.goto(`/configuracion/${path}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })

  test('mientras se guarda, el botón muestra el progreso y no envía dos veces', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    let patches = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/organization', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      patches++
      await held
      return route.fallback()
    })
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    const busy = page.getByRole('button', { name: 'Guardando…' })
    await expect(busy).toBeVisible()
    await busy.click({ force: true })
    await page.keyboard.press('Enter')
    release()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    expect(patches).toBe(1)
  })

  for (const viewport of [desktop, phone]) {
    test(`sin saltos de layout a ${viewport.width} px: el formulario no se mueve al llegar los ajustes ni el dato real`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/organization', async (route) => {
        await held
        return route.fallback()
      })
      let releaseMetrics!: () => void
      const heldMetrics = new Promise<void>((resolve) => (releaseMetrics = resolve))
      await page.route('**/api/tickets/metrics', async (route) => {
        await heldMetrics
        return route.fallback()
      })
      await page.goto('/configuracion/empresa')
      await expect(page.getByText('Cargando los ajustes de la empresa…')).toBeAttached()
      const form = page.locator('form')
      const before = await form.boundingBox()
      release()
      await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeVisible()
      const mid = await form.boundingBox()
      expect(mid!.y).toBe(before!.y)
      expect(mid!.height).toBeCloseTo(before!.height, 0)
      // La línea «Ahora respondes en N min» se reserva: llegar las métricas no mueve nada.
      const bar = await saveBar(page).boundingBox()
      releaseMetrics()
      await expect(page.getByText('Ahora respondes en 18 min.')).toBeVisible()
      const after = await form.boundingBox()
      expect(after!.height).toBeCloseTo(mid!.height, 0)
      expect((await saveBar(page).boundingBox())!.y).toBeCloseTo(bar!.y, 0)
    })
  }

  test('la barra de guardar no tapa el campo enfocado con teclado, a 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto('/configuracion/empresa')
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).focus()
    // Tab recorre los campos hacia abajo: cada uno, al recibir el foco, queda por encima de la barra.
    for (const field of ['Correo de soporte', 'Zona horaria', 'Objetivo de primera respuesta']) {
      await page.keyboard.press('Tab')
      const control = page.getByRole(field === 'Zona horaria' ? 'combobox' : 'textbox', { name: field })
      await expect(control).toBeFocused()
      const box = (await control.boundingBox())!
      const bar = (await saveBar(page).boundingBox())!
      expect(box.y + box.height, `${field} queda por encima de la barra`).toBeLessThanOrEqual(bar.y + 0.5)
    }
    // Y la muestra de color marcada, el último campo, también.
    await page.keyboard.press('Tab')
    const swatch = page.getByRole('radio', { name: 'Azul' })
    await expect(swatch).toBeFocused()
    const box = (await swatch.boundingBox())!
    expect(box.y + box.height, 'el color queda por encima de la barra').toBeLessThanOrEqual(
      (await saveBar(page).boundingBox())!.y + 0.5,
    )
  })

  for (const viewport of [
    { width: 390, height: 720 },
    { width: 1440, height: 700 },
  ]) {
    test(`tabular hasta la barra de guardar no desplaza la página, a ${viewport.width}×${viewport.height} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/configuracion/empresa')
      await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Otro nombre')
      // El último campo es el grupo «Color» (la muestra marcada): de ahí a la barra de guardar no debe moverse la página.
      const lastField = page.getByRole('radio', { name: 'Azul' })
      await lastField.focus()
      await expect(lastField).toBeFocused()
      const before = await page.evaluate(() => window.scrollY)
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Descartar' })).toBeFocused()
      // Los botones de la barra ya están a la vista: el foco no debe mover la página para dejar sitio a la barra.
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
    })
  }

  test('el agente ve Empresa en solo lectura, con el aviso y sin barra de guardar', async ({ page }) => {
    await mockApi(page, 'agent')
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await expect(sections(page).getByRole('link')).toHaveText([/Empresa/, /Permisos/, /General/, /Tus espacios/])
    await expect(page.getByText('Solo un administrador puede cambiar los datos de la empresa.')).toBeVisible()
    await expect(page.getByText('Acme Studio', { exact: true }).last()).toBeVisible()
    await expect(page.getByText('Ahora respondes en 18 min.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Descartar' })).toHaveCount(0)
  })
})

test.describe('configuración: General', () => {
  test('el nombre se cambia con la barra y se ve en el sidebar', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    await expect(page.getByText('yelisson@acme.example')).toBeVisible()
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Yelisson O. Ortiz')
    await expect(page.getByText('Tienes cambios sin guardar en «Nombre».')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Yelisson O. Ortiz')).toBeVisible()
  })

  test('en móvil el nombre lleva su propio «Guardar nombre» y no hay barra', async ({ page }) => {
    await page.setViewportSize(phone)
    await page.goto('/configuracion/general')
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
    const save = page.getByRole('button', { name: 'Guardar nombre' })
    await expect(save).toBeDisabled()
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Yelisson O. Ortiz')
    await save.click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
  })

  test('«Correo» y «Rol» llevan el mismo estilo de etiqueta que «Nombre»', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    const font = (text: string, tag: string) =>
      page.locator(tag, { hasText: new RegExp(`^${text}$`) }).evaluate((el) => {
        const style = getComputedStyle(el)
        return `${style.fontSize}/${style.fontWeight}/${style.color}`
      })
    const name = await font('Nombre', 'label')
    expect(await font('Correo', 'dt')).toBe(name)
    expect(await font('Rol', 'dt')).toBe(name)
  })

  test('el tema se aplica al momento, sin la barra, y se recuerda en este navegador', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    await expect(page.getByText('Ahora: claro')).toBeVisible()
    // Se elige pulsando la tarjeta entera, no solo el círculo: un clic en la miniatura (arriba a la izquierda).
    const card = page.getByRole('radio', { name: 'Oscuro' }).locator('xpath=ancestor::div[1]')
    const box = (await card.boundingBox())!
    await page.mouse.click(box.x + 20, box.y + 20)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
  })

  test('el tema y el botón de la barra superior comparten el mismo almacén', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    await page.getByRole('radio', { name: 'Oscuro' }).check()
    const toggle = page.getByRole('button', { name: 'Cambiar a tema claro' })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked()
  })

  test('elegir el tema no mueve nada: el borde de selección no desplaza el contenido de la tarjeta', async ({
    page,
  }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    const radio = page.getByRole('radio', { name: 'Claro' })
    const card = radio.locator('xpath=ancestor::div[1]')
    // Todo relativo a la tarjeta: `check()` desplaza la página y las coordenadas absolutas cambian.
    const measure = async () => {
      const box = (await card.boundingBox())!
      const thumb = (await card.locator('[aria-hidden="true"]').first().boundingBox())!
      const dot = (await radio.boundingBox())!
      return {
        width: box.width,
        height: box.height,
        thumb: [thumb.x - box.x, thumb.y - box.y, thumb.width, thumb.height],
        dot: [dot.x - box.x, dot.y - box.y],
      }
    }
    const before = await measure()
    await radio.check()
    await expect(radio).toBeChecked()
    expect(await measure()).toEqual(before)
  })

  test('con teclado las flechas cambian el tema', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/general')
    await page.getByRole('radio', { name: 'Claro' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('el cliente solo ve «Tu cuenta › General», con «Cliente de {espacio}» y sin enlace a permisos', async ({
    page,
  }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize(desktop)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion\/general$/)
    await expect(sections(page).getByRole('link')).toHaveText([/General/])
    await expect(sections(page).getByText('Espacio', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Cliente de Acme Studio')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Ver qué puede hacer' })).toHaveCount(0)
    for (const path of ['empresa', 'permisos']) {
      await page.goto(`/configuracion/${path}`)
      await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible()
    }
  })
})

test.describe('configuración: Permisos', () => {
  test('con ancho para ello es una tabla con una columna por rol, y la leyenda dice «Con límites»', async ({
    page,
  }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/permisos')
    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveText(['Capacidad', 'Administrador', 'Agente', 'Cliente'])
    await expect(page.getByRole('list', { name: 'Leyenda' })).toContainText('Con límites')
    await expect(table).toContainText('Solo los suyos')
    await expect(table).toContainText('Solo los públicos')
    await expect(page.getByText(/servidor/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0)
  })

  test('a 768 px el panel es estrecho: selector de rol, sin desbordar', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/configuracion/permisos')
    await expect(page.getByRole('group', { name: 'Rol' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('en móvil un selector de rol muestra los permisos de un rol a la vez, agrupados por sección', async ({
    page,
  }) => {
    await page.setViewportSize(phone)
    await page.goto('/configuracion/permisos')
    const roles = page.getByRole('group', { name: 'Rol' })
    await expect(roles.getByRole('button', { name: 'Administrador' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'Tickets' })).toBeVisible()
    await roles.getByRole('button', { name: 'Cliente' }).click()
    await expect(page.getByText('Ver tickets y sus mensajes').locator('xpath=ancestor::li')).toContainText(
      'Solo los suyos',
    )
    // Ninguna capacidad se oculta por el ancho: están las 14 con el rol elegido.
    await expect(page.getByRole('heading', { level: 2 }).locator('xpath=following-sibling::ul/li')).toHaveCount(14)
    const box = await roles.getByRole('button', { name: 'Cliente' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('configuración: con el aviso de la demostración', () => {
  test('la barra de guardar queda por encima del aviso y el campo enfocado por encima de la barra, a 390 px', async ({
    page,
  }) => {
    await mockApi(page, 'admin', { demo: true })
    await page.setViewportSize({ width: 390, height: 520 })
    await page.goto('/configuracion/empresa')
    const banner = page.getByRole('region', { name: 'Demostración pública' })
    await expect(banner).toBeVisible()
    // El aviso publica su altura en `:root` y la barra se sube con CSS sobre ella.
    const published = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--demo-banner-height'))
    await expect.poll(published).toBe(`${(await banner.boundingBox())!.height}px`)
    await expect(saveBar(page)).toHaveCSS('bottom', await published())
    const aboveBanner = async () => {
      const bar = (await saveBar(page).boundingBox())!
      const notice = (await banner.boundingBox())!
      return notice.y - (bar.y + bar.height)
    }
    // Arriba del formulario la barra va pegada al borde inferior, donde también está el aviso: no se pisan.
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).focus()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeInViewport()
    await expect.poll(aboveBanner).toBeGreaterThanOrEqual(-0.5)
    // Y el último campo, al enfocarse, queda por encima de la barra.
    const target = page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })
    await target.focus()
    await expect(target).toBeFocused()
    await expect.poll(aboveBanner).toBeGreaterThanOrEqual(-0.5)
    const field = (await target.boundingBox())!
    const bar = (await saveBar(page).boundingBox())!
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y + 0.5)
  })
})
