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
