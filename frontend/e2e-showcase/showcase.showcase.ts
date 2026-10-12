import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * La demostración estática (`--mode showcase`) servida bajo `/resolve/`: el frontend completo con la API simulada de los
 * e2e, sin red. Las rutas son relativas para que se resuelvan bajo la base.
 */

const NOTICE = 'Demostración con datos de ejemplo'
const widths = [320, 1440]
const themes = ['light', 'dark'] as const

/** Ninguna petición a `/api` debe salir hacia la red: las atiende el adaptador dentro de la página. */
function watchNetwork(page: Page) {
  const leaked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) leaked.push(request.url())
  })
  return leaked
}

const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name })
/** El título de Inicio es el saludo con el nombre de quien entró. */
const HOME = /^Buen(os días|as tardes|as noches), /
const picker = (page: Page) => page.getByRole('combobox', { name: 'Usuario de demostración' })
const ADMIN = 'Administración'
const CUSTOMER = 'Cliente'
const NEWCOMER = 'Persona nueva (sin espacio)'

/** Elige un usuario en el selector de /entrar y entra con él. */
async function enterAs(page: Page, label: string) {
  await picker(page).selectOption({ label })
  await page.getByRole('button', { name: 'Usar este usuario' }).click()
}

const signOut = async (page: Page) => {
  // Por debajo de 768 px el perfil con la cuenta está al pie del drawer.
  const openMenu = page.getByRole('button', { name: 'Abrir menú' })
  if (await openMenu.isVisible()) await openMenu.click()
  await page.getByRole('button', { name: /^Cuenta:/ }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
}

test('la raíz empieza en /entrar con el selector de usuarios y sin proveedor de identidad', async ({ page }) => {
  const leaked = watchNetwork(page)
  await page.goto('')
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
  await expect(picker(page)).toBeVisible()
  await expect(
    page.getByText('Elige un usuario de demostración para ver los tickets, clientes y reportes'),
  ).toBeVisible()
  await expect(page.getByText('Usa tu cuenta')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Entrar con tu cuenta' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: NOTICE })).toContainText('los cambios no se guardan')
  expect((await picker(page).locator('option').allTextContents()).length).toBe(4)
  expect(leaked).toEqual([])
})

for (const theme of themes) {
  test(`el selector y su descripción caben a 320 px sin recortes · ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('')
    const select = picker(page)
    await expect(select).toBeVisible()
    expect(await select.locator('option').allTextContents()).toEqual([
      'Administración',
      'Agente',
      'Cliente',
      'Persona nueva (sin espacio)',
    ])
    await expect(page.getByText(/Administración ve y gestiona todo; Agente atiende tickets/)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
    const box = (await select.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  })
}

test('una URL profunda sin sesión lleva a /entrar y vuelve a ella tras elegir usuario', async ({ page }) => {
  await page.goto('tickets/1048')
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
  await enterAs(page, ADMIN)
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets\/1048$/)
})

test('recorre Inicio, Tickets, un ticket, Clientes, Conocimiento y Ajustes', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/?$/)

  const nav = page.getByRole('navigation')
  await nav.getByRole('link', { name: 'Tickets' }).click()
  await expect(heading(page, 'Tickets')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)

  // Desde 1200 px elegir un ticket abre su vista previa; «Abrir completo» lleva al detalle.
  await page
    .getByRole('link', { name: /No puedo acceder a mi cuenta/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'Abrir completo' }).click()
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()

  await nav.getByRole('link', { name: 'Clientes' }).click()
  await expect(heading(page, 'Clientes')).toBeVisible()

  await nav.getByRole('link', { name: 'Conocimiento' }).click()
  await expect(heading(page, '¿Qué necesitas resolver?')).toBeVisible()

  await nav.getByRole('link', { name: 'Configuración' }).click()
  await expect(heading(page, 'Configuración')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('se entra como cliente y se ve lo propio del cliente; cerrar sesión vuelve a /entrar', async ({ page }) => {
  await page.goto('')
  await enterAs(page, CUSTOMER)
  await expect(heading(page, HOME).or(heading(page, 'Mis solicitudes'))).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()

  await signOut(page)
  // Volver a elegir al mismo usuario tras cerrar sesión también entra.
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()

  // Y como administración se ve lo que el cliente no.
  await signOut(page)
  await enterAs(page, ADMIN)
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
})

test('recargar conserva el usuario y la ruta', async ({ page }) => {
  await page.goto('')
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  await page.getByRole('link', { name: 'Mis solicitudes' }).click()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)

  await page.reload()
  await expect(heading(page, 'Mis solicitudes')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets$/)
  // Sigue siendo el cliente, no la administración.
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
})

test('un enlace profundo recargado a mano conserva la sesión en esa ruta', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  await page.goto('tickets/1048')
  await expect(heading(page, 'No puedo acceder a mi cuenta')).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/tickets\/1048$/)
})

test('abrir de nuevo la dirección de la demostración tras entrar sigue dentro', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  // Una carga completa de la dirección pública: GitHub Pages redirige `/resolve` a `/resolve/`, que es lo que abre `goto('')`.
  await page.goto('')
  await expect(heading(page, HOME)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
  await expect(page).not.toHaveURL(/\/entrar$/)
})

test('los cambios no se guardan: un artículo creado desaparece al recargar aunque la sesión siga', async ({ page }) => {
  const title = 'Artículo efímero de la demostración'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, ADMIN)
  await page.goto('conocimiento/nuevo')
  await page.getByRole('textbox', { name: 'Título' }).fill(title)
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Cuenta y acceso' })
  await page.getByRole('textbox', { name: 'Contenido' }).fill('Texto de prueba.')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(heading(page, 'Editar artículo')).toBeVisible()
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Conocimiento' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.reload()
  await expect(heading(page, '¿Qué necesitas resolver?')).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

test('una pestaña nueva empieza en /entrar aunque otra tenga sesión', async ({ page, context }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  const other = await context.newPage()
  await other.goto('')
  await expect(other.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(other).toHaveURL(/\/resolve\/entrar$/)
})

test('cerrar sesión y recargar deja en /entrar', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  await signOut(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
})

test('elegir otro usuario tras cerrar sesión sustituye la elección que sobrevive a la recarga', async ({ page }) => {
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible()
  await signOut(page)
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
})

test('la administración tiene cuatro espacios: cambia a uno donde es cliente y sale de otro, todo en memoria', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  const card = page.getByRole('button', { name: /^Espacio: .*\. Cambiar de espacio$/ })
  await expect(card).toContainText('Acme Studio')
  await card.click()
  const menu = page.getByRole('menu', { name: 'Cambiar de espacio' })
  await expect(menu.getByRole('menuitemradio')).toHaveText([
    /Acme Studio/,
    /Kora Fitness/,
    /Lumen Diseño/,
    /Norte Viajes/,
  ])

  // En «Norte Viajes» es cliente: sus solicitudes y sin «Tus espacios».
  await menu.getByRole('menuitemradio', { name: /^Norte Viajes/ }).click()
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)

  // En «Lumen Diseño» es agente; allí «Tus espacios» deja salir de él.
  await card.click()
  await menu.getByRole('menuitemradio', { name: /^Lumen Diseño/ }).click()
  await expect(card).toContainText('Agente')
  await page.goto('configuracion/espacios')
  await page.getByRole('button', { name: 'Salir de Lumen Diseño' }).click()
  await page
    .getByRole('dialog', { name: '¿Salir de Lumen Diseño?' })
    .getByRole('button', { name: 'Salir del espacio' })
    .click()
  await expect(card).toContainText('Acme Studio')
  await card.click()
  await expect(menu.getByRole('menuitemradio')).toHaveText([/Acme Studio/, /Kora Fitness/, /Norte Viajes/])

  // El único administrador de Acme no puede salir: la demostración aplica la misma regla que el servidor.
  await page.keyboard.press('Escape')
  await page.goto('configuracion/espacios')
  await page.getByRole('button', { name: 'Salir de Acme Studio' }).click()
  await page
    .getByRole('dialog', { name: '¿Salir de Acme Studio?' })
    .getByRole('button', { name: 'Salir del espacio' })
    .click()
  await expect(page.getByRole('dialog', { name: 'No puedes salir de Acme Studio' })).toBeVisible()

  // Recargar reinicia la demostración: los cuatro espacios vuelven.
  await page.reload()
  await card.click()
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4)
})

test('la administración ha creado 2 de 3 espacios: crea el tercero, en memoria, con «Primeros pasos», y ya no puede más', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  await page.goto('configuracion/espacios')
  await expect(page.getByText('Has creado 2 de 3 espacios.')).toBeVisible()
  await page.getByRole('button', { name: 'Crear espacio' }).click()
  const dialog = page.getByRole('dialog', { name: 'Crear espacio' })
  await dialog.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Taller Sur')
  await dialog.getByRole('button', { name: 'Crear espacio' }).click()
  await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Ya estás en Taller Sur')
  await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible()
  // Sin recargar: recargar reinicia la demostración. «Tus espacios» está en el selector.
  await page.getByRole('button', { name: /^Espacio: .*\. Cambiar de espacio$/ }).click()
  await page.getByRole('menuitem', { name: 'Tus espacios' }).click()
  await expect(page.getByText('Has creado 3 de 3 espacios.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear espacio' })).toHaveCount(0)

  // Recargar reinicia la demostración: el espacio creado desaparece y el administrador vuelve a 2 de 3.
  await page.reload()
  await expect(page.getByText('Has creado 2 de 3 espacios.')).toBeVisible()
})

test('el agente y el cliente de la demostración tienen un solo espacio: sin salida; el agente puede crear (modo abierto) y el cliente no ve ni el selector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, 'Agente')
  await page.goto('configuracion/espacios')
  await expect(page.getByRole('button', { name: 'Salir de Acme Studio' })).toBeDisabled()
  await expect(page.getByText('Es tu único espacio')).toBeVisible()
  // La demostración corre en el modo abierto: quien atiende tickets, aunque no administre, puede crear su espacio.
  await expect(page.getByRole('button', { name: 'Crear espacio' })).toBeVisible()
  await signOut(page)
  await enterAs(page, CUSTOMER)
  await expect(page.getByRole('link', { name: 'Mis solicitudes' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Cambiar de espacio/ })).toHaveCount(0)
})

test('«Persona nueva (sin espacio)» entra a «Crea tu espacio», crea el suyo en memoria y recargar vuelve al inicio', async ({
  page,
}) => {
  const leaked = watchNetwork(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, NEWCOMER)
  await expect(heading(page, 'Crea tu espacio')).toBeFocused()
  await expect(page).toHaveURL(/\/resolve\/entrar$/)
  await expect(page.getByText('Hola, Nueva Persona.')).toBeVisible()
  await expect(page.getByText('nueva.persona@demo.example')).toBeVisible()
  // La demostración avisa también aquí, fuera de la shell.
  await expect(page.getByRole('region', { name: NOTICE })).toBeVisible()

  await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Taller Sur')
  await page.getByRole('button', { name: 'Crear espacio' }).click()
  await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText('Ya estás en Taller Sur')
  await expect(page).toHaveURL(/\/resolve\/?$/)
  await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Espacio: Taller Sur\./ })).toContainText('Administrador')
  await expect(page.locator('#contenido')).toBeFocused()

  // Recargar reinicia la demostración: el espacio creado desaparece y la persona sigue sin espacio.
  await page.reload()
  await expect(heading(page, 'Crea tu espacio')).toBeVisible()
  expect(leaked).toEqual([])
})

test('«Persona nueva (sin espacio)» puede entrar con otra cuenta desde «Crea tu espacio»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('')
  await enterAs(page, NEWCOMER)
  await expect(heading(page, 'Crea tu espacio')).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con otra cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  await expect(picker(page)).toBeVisible()
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
})

for (const width of [390, 1440]) {
  test(`recargar conserva la sesión y cerrar sesión la quita · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('')
    await enterAs(page, ADMIN)
    await expect(heading(page, HOME)).toBeVisible()
    await page.goto('reportes')
    await expect(page).toHaveURL(/\/resolve\/reportes$/)
    await page.reload()
    await expect(page).toHaveURL(/\/resolve\/reportes$/)
    await expect(heading(page, 'Reportes')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await signOut(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Entra a Resolve' })).toBeVisible()
  })
}

for (const theme of themes) {
  for (const width of widths) {
    test(`el aviso cabe sin recortes ni scroll horizontal · ${theme} · ${width}px`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('')
      await enterAs(page, ADMIN)
      await expect(heading(page, HOME)).toBeVisible()
      const banner = page.getByRole('region', { name: NOTICE })
      await expect(banner).toBeVisible()
      const link = banner.getByRole('link', { name: 'ver el código' })
      await expect(link).toHaveAttribute('href', 'https://github.com/Yelison/resolve')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(0)
      expect(await banner.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
      const box = (await banner.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeCloseTo(900, 0)
      if (width < 768) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)

      // Contraste legible en ambos temas: el texto no hereda el color del fondo.
      const { color, background } = await banner.evaluate((element) => {
        const style = getComputedStyle(element)
        return { color: style.color, background: style.backgroundColor }
      })
      expect(color).not.toBe(background)
    })
  }
}

test('404.html es idéntico a index.html para que una URL profunda cargue en GitHub Pages', () => {
  const dist = resolve(import.meta.dirname, '../dist/showcase')
  expect(readFileSync(resolve(dist, '404.html'), 'utf8')).toBe(readFileSync(resolve(dist, 'index.html'), 'utf8'))
})

test('la búsqueda global funciona con la API simulada: Ctrl+K, resultados agrupados y navegación', async ({ page }) => {
  const leaked = watchNetwork(page)
  await page.goto('')
  await enterAs(page, ADMIN)
  await expect(heading(page, HOME)).toBeVisible()
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'Buscar en Resolve' })
  await expect(search).toBeFocused()
  // «ca» encuentra un ticket («Cambiar correo de facturación»), un cliente («Carlos Ruiz») y un artículo («Descargar una
  // factura»): desde #133 ninguna empresa de cliente se llama «Acme Studio», así que «ac» ya no daba clientes.
  await search.fill('ca')
  const list = page.getByRole('listbox', { name: 'Resultados de la búsqueda' })
  await expect(list.getByRole('group', { name: 'Tickets' })).toBeVisible()
  await expect(list.getByRole('group', { name: 'Clientes' })).toBeVisible()
  await expect(list.getByRole('group', { name: 'Artículos' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/resolve\/tickets\/\d+$/)
  expect(leaked).toEqual([])
})
