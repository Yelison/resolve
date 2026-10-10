import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
