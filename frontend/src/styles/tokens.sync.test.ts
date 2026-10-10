/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* `tokens.css` es una copia generada del `tokens.css` de `@yelison/forma-ui`: una cabecera de Resolve y, debajo, el
 * archivo del paquete sin cambios. Este test falla si el contenido difiere del paquete instalado: un Dependabot que
 * cambie tokens no se funde solo hasta que alguien ejecute `npm run sync:forma-tokens` y revise el cambio visual.
 *
 * No exige que la versión de la cabecera sea la instalada: un parche que no toca los tokens no obliga a sincronizar, y
 * si lo exigiera ninguno se fundiría solo. La versión de la cabecera es la de la última sincronía.
 *
 * El paquete se resuelve por `exports` (como hace el script), no por la estructura de `dist/`. */

const require = createRequire(join(process.cwd(), 'package.json'))
const packageTokens = readFileSync(require.resolve('@yelison/forma-ui/tokens.css'), 'utf8')
const COPIES = {
  'src/styles/tokens.css': readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'),
  'la copia del tema de Keycloak': readFileSync(
    join(process.cwd(), '../deploy/keycloak/themes/resolve/login/resources/css/tokens.css'),
    'utf8',
  ),
}

/** Nombres `--*` declarados (a la izquierda de un `:`) en una hoja, sin comentarios. */
const declaredNames = (css: string) =>
  new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name = '']) => name))

/** Cabecera de Resolve: un solo comentario, con la versión y la orden que regenera el archivo. */
const HEADER = /^\/\* Generado desde `@yelison\/forma-ui@\d+\.\d+\.\d+[^`]*`[^]*?npm run sync:forma-tokens[^]*?\*\/\n\n/

describe('tokens.css · sincronía con @yelison/forma-ui', () => {
  for (const [name, css] of Object.entries(COPIES)) {
    describe(name, () => {
      it('empieza por la cabecera de Resolve', () => {
        expect(css).toMatch(HEADER)
      })

      it('lleva debajo, idéntico, el tokens.css del paquete instalado (ejecuta `npm run sync:forma-tokens`)', () => {
        expect(css.replace(HEADER, '')).toBe(packageTokens)
      })
    })
  }
})

describe('la capa de Resolve no redeclara ningún token del paquete', () => {
  const packageNames = declaredNames(packageTokens)
  const LAYERS = {
    'global.css': { names: ['--header-height', '--page-gutter', '--sidebar-expanded'] },
    'chart-tokens.css': { names: ['--color-chart-1', '--color-chart-seq-4'] },
  }

  for (const [file, { names }] of Object.entries(LAYERS)) {
    it(`${file}: ningún nombre coincide con el tokens.css del paquete, ni con el mismo valor`, () => {
      const declared = declaredNames(readFileSync(join(process.cwd(), 'src/styles', file), 'utf8'))
      // Sin esto, una expresión que no encuentre nada haría pasar el test en vacío.
      for (const name of names) expect(declared, `${file} declara ${name}`).toContain(name)
      expect([...declared].filter((name) => packageNames.has(name))).toEqual([])
    })
  }
})
