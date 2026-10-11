/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themePalettes } from './themePalettes.generated'

/* El módulo lo genera `npm run sync:forma-tokens` desde el `tokens.json` del paquete. Si el kit cambia un color y
 * nadie sincroniza, las miniaturas enseñarían un tema que ya no existe: este test lo impide. */

const require = createRequire(join(process.cwd(), 'package.json'))
const tokens = JSON.parse(readFileSync(require.resolve('@yelison/forma-ui/tokens.json'), 'utf8')) as Record<
  'light' | 'dark',
  Record<string, string>
>

describe('themePalettes · sincronía con @yelison/forma-ui', () => {
  it.each(['light', 'dark'] as const)(
    'el tema %s coincide con el tokens.json del paquete (ejecuta `npm run sync:forma-tokens`)',
    (theme) => {
      for (const [token, value] of Object.entries(themePalettes[theme])) {
        expect(value, `${theme} ${token}`).toBe(tokens[theme][token])
      }
    },
  )

  it('cubre todos los colores que lee ThemeBlock', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/settings/ThemeBlock.tsx'), 'utf8')
    const used = [...source.matchAll(/palette\['(--[a-z-]+)'\]/g)].map(([, name]) => name)
    expect(used.length).toBeGreaterThan(0)
    for (const theme of ['light', 'dark'] as const)
      expect(Object.keys(themePalettes[theme])).toEqual(expect.arrayContaining(used))
  })

  it('ThemeBlock ya no importa el tokens.json entero', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/settings/ThemeBlock.tsx'), 'utf8')
    expect(source).not.toMatch(/from '[^']*tokens\.json'/)
  })
})
