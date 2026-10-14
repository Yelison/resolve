/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/* El README de @yelison/forma-ui pide `styles.css` antes que el CSS de Resolve. Con chunks, el orden de los `@import` de
 * `global.css` no lo garantiza (Vite enlaza antes el CSS de los chunks compartidos), así que `styles.css` se importa en
 * la primera línea del barrel de `components/ui`, que abre `ui-*.css`. `e2e/production-bundle.spec.ts` lo comprueba en
 * el build; aquí se fija el fuente. */
describe('global.css · hojas del paquete', () => {
  const globalCss = read('src/styles/global.css')
  const imports = [...withoutComments(globalCss).matchAll(/@import\s+'([^']+)'/g)].map(([, path]) => path)

  it('importa tokens, base.css y los tokens de los gráficos y de los espacios, en ese orden, y no styles.css', () => {
    expect(imports.slice(imports.indexOf('./tokens.css'))).toEqual([
      './tokens.css',
      '@yelison/forma-ui/base.css',
      './chart-tokens.css',
      './workspace-tokens.css',
    ])
    expect(imports).not.toContain('@yelison/forma-ui/styles.css')
  })

  it('ningún @import va después de una regla: la hoja entera cuenta', () => {
    const body = withoutComments(globalCss)
    const firstRule = body.search(/[^@\s][^{;]*\{/)
    expect(body.lastIndexOf('@import')).toBeLessThan(firstRule)
  })
})

/* El README del paquete pide el reset de los controles en `@layer base`: sin capa tiene la especificidad de un elemento y
 * gana a la caja de los controles del paquete, que va en `:where()`. Aquí se fija el fuente; `e2e/production-bundle.spec.ts`
 * comprueba que el build conserva la capa. */
describe('global.css · reset de los controles en @layer base', () => {
  const body = withoutComments(read('src/styles/global.css'))
  const RESET = /(?:^|[}\s])button\s*,\s*input\s*,\s*select\s*,\s*textarea\s*\{[^}]*\}/g
  /** El contenido de cada `@layer base { … }` de nivel superior. */
  const layerBase = [...body.matchAll(/@layer\s+base\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(([, inner]) => inner ?? '')

  it('declara el reset `font: inherit; color: inherit` dentro de `@layer base`', () => {
    const resets = layerBase.flatMap((inner) => inner.match(RESET) ?? [])
    expect(resets).toHaveLength(1)
    expect(resets[0]).toMatch(/font:\s*inherit/)
    expect(resets[0]).toMatch(/color:\s*inherit/)
  })

  it('no deja una copia del reset fuera de la capa', () => {
    const outside = layerBase.reduce((css, inner) => css.replace(inner, ''), body)
    expect(outside.match(RESET) ?? []).toEqual([])
  })
})

describe('components/ui/index.ts · styles.css del paquete', () => {
  it('es la primera sentencia del barrel, antes de cualquier componente de Resolve', () => {
    const statements = withoutComments(read('src/components/ui/index.ts').replace(/^\s*\/\/.*$/gm, ''))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(statements[0]).toBe("import '@yelison/forma-ui/styles.css'")
  })
})
