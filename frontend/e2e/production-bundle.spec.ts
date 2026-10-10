import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { themeScript } from '@yelison/forma-ui'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * El build de producción no lleva nada de la demostración estática: ni la API simulada de los e2e ni su adaptador ni
 * el aviso. Lee el `dist/` que la propia suite acaba de construir (`playwright.config.ts`, modo `production`) y busca
 * lo que solo existe en los mocks. El catálogo de componentes (`/catalogo`) tiene sus propios datos de ejemplo, con
 * nombres como «Laura Méndez»: solo existe con el servidor de desarrollo, nunca en este build.
 */
const dist = resolve(import.meta.dirname, '../dist')
const assets = resolve(dist, 'assets')

const SMOKE = process.env.SMOKE === '1'

// El build `smoke` conserva el selector de usuarios de demostración a propósito.
test.skip(SMOKE, 'el build smoke lleva el selector de demostración')

const scripts = () =>
  readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, code: readFileSync(resolve(assets, name), 'utf8') }))

test('el build de producción no incluye la API simulada ni el modo showcase', () => {
  const chunks = scripts()
  expect(chunks.length).toBeGreaterThan(0)
  const forbidden = [
    'Laura Méndez',
    'acme.example',
    'cliente.example',
    'e2e-csrf-token',
    'Sin fixture para',
    'Demostración con datos de ejemplo',
    'Elige un usuario de demostración',
    'showcase',
  ]
  const found = chunks.flatMap(({ name, code }) =>
    forbidden.filter((text) => code.includes(text)).map((text) => `${name}: ${text}`),
  )
  expect(found, 'texto de los mocks en el build de producción').toEqual([])
})

test('el build de producción no emite el adaptador de la demostración', () => {
  const names = readdirSync(assets)
  expect(names.filter((name) => /^(install|adapter|users)-/.test(name))).toEqual([])
  expect(readFileSync(resolve(dist, 'index.html'), 'utf8')).not.toContain('/resolve/')
})

test('el build de producción no incluye el catálogo de componentes ni su ruta', async ({ page }) => {
  expect(readdirSync(assets).filter((name) => name.startsWith('CatalogPage-'))).toEqual([])
  expect(
    scripts()
      .filter(({ code }) => code.includes('/catalogo'))
      .map(({ name }) => name),
  ).toEqual([])
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible()
})

/**
 * Las reglas del paquete (`.forma-*`) tienen que ir antes que el CSS de Resolve: una clase propia que las sobrescribe
 * tiene su misma especificidad y solo gana si llega después. Vite enlaza el CSS de los chunks compartidos antes que el del
 * punto de entrada, así que `styles.css` se importa en la primera línea de `components/ui/index.ts` y abre `ui-*.css`.
 */
test('el build de producción enlaza styles.css del paquete antes que el CSS de Resolve', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const sheets = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/assets\/([^"]+\.css)"/g)].map(
    ([, name = '']) => name,
  )
  expect(sheets.length).toBeGreaterThan(1)
  const css = (name: string) => readFileSync(resolve(assets, name), 'utf8')

  const [first = '', ...rest] = sheets
  expect(first, 'primera hoja enlazada').toMatch(/^ui-/)
  expect(css(first).trimStart().startsWith('.forma-'), 'la primera regla de ui-*.css es del paquete').toBe(true)
  // Y las reglas de los componentes no están en ninguna otra hoja, ni en las del arranque ni en las de las rutas diferidas
  // (`base.css`, con `.forma-visually-hidden` y `.forma-scroll-locked`, sí va en `index-*.css`: no depende del orden).
  const others = [...rest, ...readdirSync(assets).filter((name) => name.endsWith('.css') && name !== first)]
  expect(
    [...new Set(others)].filter((name) => /\.forma-(?!visually-hidden|scroll-locked)/.test(css(name))),
    'hojas con reglas del paquete aparte de la primera',
  ).toEqual([])
})

/**
 * El backend admite en la CSP el hash del script en línea de este `index.html` (`ContentSecurityPolicy.java`): tiene que
 * ser el único y llegar al `dist/` tal cual, sin que Vite lo reescriba. Es la salida de `themeScript` del paquete.
 */
test('el build lleva un solo script en línea: el de primer pintado del tema, sin cambios', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc\s*=)[^>]*>(.*?)<\/script>/gis)]
    .map(([, body = '']) => body)
    .filter((body) => body.trim())
  expect(inline).toEqual([themeScript({ storageKey: 'resolve-theme' })])
})

/**
 * Una clase de Resolve pasada a un componente del paquete (`<Modal className={styles.dialog}>` de la búsqueda global)
 * tiene la misma especificidad que la regla del paquete y solo gana si llega después. Mide en el build, con el diálogo
 * abierto, todas las reglas de una sola clase que le afectan: si una propiedad la fijan el paquete (`.forma-*`) y una
 * clase de Resolve, la de Resolve tiene que venir más tarde en la cascada. Hoy `.dialog` solo define una variable
 * propia; este test falla el día que pise otra propiedad con el CSS del paquete detrás, o si `styles.css` deja de abrir
 * `ui-*.css` (el test de arriba lo comprueba por la hoja; este, por el resultado).
 */
async function cascadeOfOpenDialog(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]')
    if (!dialog) throw new Error('no hay ningún diálogo abierto')
    const rules: { order: number; selector: string; forma: boolean; props: string[] }[] = []
    let order = 0
    const visit = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSStyleRule) {
          order += 1
          const selector = rule.selectorText
          // Solo las reglas de una sola clase: tienen la misma especificidad y deciden por orden.
          if (!/^\.[^\s.:>+~[#]+$/.test(selector) || !dialog.matches(selector)) continue
          rules.push({ order, selector, forma: selector.startsWith('.forma-'), props: Array.from(rule.style) })
        } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)
    const losses: { prop: string; resolve: string; forma: string }[] = []
    for (const own of rules.filter((r) => !r.forma))
      for (const lib of rules.filter((r) => r.forma))
        for (const prop of own.props)
          if (lib.props.includes(prop) && own.order < lib.order)
            losses.push({ prop, resolve: own.selector, forma: lib.selector })
    return {
      forma: rules.filter((r) => r.forma).length,
      resolve: rules.filter((r) => !r.forma).map((r) => r.selector),
      losses,
    }
  })
}

test('en el build, la clase de Resolve que se pasa al diálogo de la búsqueda gana por orden a las reglas del paquete', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await page.getByRole('button', { name: /^Buscar…/ }).click()
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible()
  const { forma, resolve: own, losses } = await cascadeOfOpenDialog(page)
  expect(forma, 'reglas del paquete que afectan al diálogo').toBeGreaterThan(0)
  expect(own, 'reglas de Resolve que afectan al diálogo (la clase de GlobalSearch)').toHaveLength(1)
  expect(losses, 'propiedades que el paquete fija después que Resolve').toEqual([])
  // Y la clase de Resolve se aplica: su variable llega al diálogo.
  const height = await page
    .getByRole('dialog', { name: 'Buscar' })
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--search-results-height').trim())
  expect(height).not.toBe('')
})
