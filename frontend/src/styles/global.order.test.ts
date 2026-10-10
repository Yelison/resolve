/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')

/* El README de @yelison/forma-ui pide este orden: tokens, styles.css, base.css y después el CSS de Resolve. Una clase de
 * Resolve que sobrescribe una del paquete tiene que ganar por especificidad, porque en el build el CSS de los componentes
 * de `components/ui` se enlaza antes que el de esta hoja (ver el comentario de global.css). */
describe('global.css · orden de las hojas', () => {
  const imports = [...globalCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+'([^']+)'/g)].map(
    ([, path]) => path,
  )

  it('importa tokens, styles.css y base.css del paquete, y después la capa de Resolve', () => {
    expect(imports.slice(imports.indexOf('./tokens.css'))).toEqual([
      './tokens.css',
      '@yelison/forma-ui/styles.css',
      '@yelison/forma-ui/base.css',
      './chart-tokens.css',
    ])
  })

  it('ningún @import va después de una regla: la hoja entera cuenta', () => {
    const body = globalCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const firstRule = body.search(/[^@\s][^{;]*\{/)
    expect(body.lastIndexOf('@import')).toBeLessThan(firstRule)
  })
})
