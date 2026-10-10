import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * `Input` es del paquete; `Select`, `Textarea` y `Combobox` comparten la caja de `shared/control.module.css`, que es una
 * copia de la del paquete (ADR 0002). Este test compara, regla a regla, lo que declaran las dos para que no se separen:
 * el anillo de foco, el estado de solo lectura, el de deshabilitado, el hover y el movimiento reducido.
 */
const packageCss = readFileSync(
  resolve(import.meta.dirname, '../../../../node_modules/@yelison/forma-ui/dist/styles.css'),
  'utf8',
)
const resolveCss = readFileSync(resolve(import.meta.dirname, './control.module.css'), 'utf8')

interface Rule {
  at: string
  selector: string
  declarations: string[]
}

const squash = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,()>])\s*/g, '$1')
    .replace(/'/g, '')
    .trim()

/** Reglas de una hoja, con el `@media` que las envuelve (un nivel basta aquí). */
function parse(css: string, at = ''): Rule[] {
  const rules: Rule[] = []
  let rest = squash(css)
  while (rest) {
    const open = rest.indexOf('{')
    if (open < 0) break
    const head = rest.slice(0, open)
    let depth = 1
    let i = open + 1
    while (depth && i < rest.length) {
      if (rest[i] === '{') depth += 1
      if (rest[i] === '}') depth -= 1
      i += 1
    }
    const body = rest.slice(open + 1, i - 1)
    rest = rest.slice(i)
    if (head.startsWith('@media')) rules.push(...parse(body, head))
    else if (!head.startsWith('@'))
      rules.push({
        at,
        selector: head,
        declarations: body
          .split(';')
          .filter(Boolean)
          .map((d) => d.replace(/^([^:]+):(.*)$/, (_, k: string, v: string) => `${k}:${v.replace(/\s*,\s*/g, ',')}`))
          .sort(),
      })
  }
  return rules
}

const key = (rule: Rule) => `${rule.at}|${rule.selector}`
// La caja del paquete lleva `box-sizing`; en Resolve lo da el reset de `global.css` (`*, *::before, *::after`).
const withoutBoxSizing = (rule: Rule) => rule.declarations.filter((d) => !d.startsWith('box-sizing:'))

describe('caja de control de Resolve frente a la del paquete', () => {
  const mirror = parse(packageCss)
    .filter((rule) => rule.selector.includes('forma-field-control'))
    .map((rule) => ({ ...rule, selector: rule.selector.replaceAll('.forma-field-control', '.control') }))
  const own = new Map(parse(resolveCss).map((rule) => [key(rule), rule]))

  it('la hoja del paquete tiene reglas del control (la comparación no está vacía)', () => {
    expect(mirror.length).toBeGreaterThanOrEqual(8)
  })

  for (const rule of mirror) {
    it(`${rule.at ? `${rule.at} ` : ''}${rule.selector}`, () => {
      const copy = own.get(key(rule))
      expect(copy, 'Resolve no tiene esta regla del paquete').toBeDefined()
      expect(copy ? withoutBoxSizing(copy) : []).toEqual(withoutBoxSizing(rule))
    })
  }
})
