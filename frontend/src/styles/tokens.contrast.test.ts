/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* Contraste WCAG 1.4.3 (≥ 4,5:1) de los pares texto/fondo que la interfaz pinta de verdad.
 *
 * Inventario: sale de buscar en los `.module.css` qué token de texto se pinta sobre qué fondo.
 *  - Mismo bloque con `color` y `background`: Badge (neutral sobre bg, semánticos sobre su `*-bg`), Button (on-brand
 *    sobre brand, red-ink sobre red-bg), Tabs (blue-ink sobre blue-bg, muted sobre surface), Sidebar y Tooltip
 *    (nav-text y nav-ink sobre nav / nav-active), Topbar (ink sobre surface-hover), Modal (ink sobre surface).
 *  - Texto sin fondo propio (`ink` y `muted` en la mayoría de los componentes): hereda el fondo del contenedor, que en
 *    la práctica es bg (página), surface (paneles, tarjetas, menús), surface-hover (hover de filas y menús) o
 *    blue-bg (selección y chips). Se comprueban sobre los cuatro.
 *  - Los colores semánticos (`*-ink`) sin fondo propio (errores de campo, métricas, avisos) van sobre bg, surface y
 *    surface-hover.
 *
 * Quedan fuera, a propósito: el texto deshabilitado (`opacity: .45` sobre cualquier par) y los elementos decorativos
 * o de estado no textual (bordes, `--color-line`, `--color-disabled`, `--color-focus`, `--color-overlay`), que se
 * rigen por 1.4.11 (3:1) y no por 1.4.3.
 */

type Theme = Readonly<Record<string, string>>

const GENERAL_BACKGROUNDS = ['bg', 'surface', 'surface-hover', 'blue-bg'] as const
const SEMANTIC_PAIRS = [
  ['blue-ink', 'blue-bg'],
  ['green-ink', 'green-bg'],
  ['amber-ink', 'amber-bg'],
  ['red-ink', 'red-bg'],
] as const

interface Pair {
  text: string
  background: string
  /** Si el par incumple hoy el mínimo, el motivo. El test se ejecuta con `it.fails` hasta que se corrija. */
  pending?: Partial<Record<'light' | 'dark', string>>
}

const PAIRS: readonly Pair[] = [
  ...(['ink', 'muted'] as const).flatMap((text) => GENERAL_BACKGROUNDS.map((background) => ({ text, background }))),
  ...(['blue-ink', 'green-ink', 'amber-ink', 'red-ink'] as const).flatMap((text) =>
    (['bg', 'surface', 'surface-hover'] as const).map((background) => ({ text, background })),
  ),
  ...SEMANTIC_PAIRS.map(([text, background]) => ({ text, background })),
  { text: 'nav-text', background: 'nav' },
  { text: 'nav-text', background: 'nav-active' },
  { text: 'nav-ink', background: 'nav' },
  { text: 'nav-ink', background: 'nav-active' },
  {
    text: 'on-brand',
    background: 'brand',
    // Hallazgo fuera del alcance de #14: el blanco sobre el azul de marca del tema oscuro (#4779ff) da 3,86:1 en
    // Button primary y en la marca de Checkbox/Radio. Es una decisión de diseño (Figma «Oscuro · brand»).
    pending: { dark: 'on-brand sobre brand en el tema oscuro: 3,86:1' },
  },
]

function parseBlock(css: string): Theme {
  return Object.fromEntries(
    [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [name, value]),
  )
}

/** Cuerpo del bloque que sigue a `selector {`, contando llaves para tolerar bloques anidados. */
function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`No se encuentra «${selector}» en tokens.css`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`Bloque «${selector}» sin cerrar`)
}

// Con `css` desactivado en la configuración de Vitest, `tokens.css?raw` llega vacío: se lee el archivo directamente
// (Vitest corre desde `frontend/`; en jsdom `import.meta.url` no es una URL `file:`).
const rawTokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

const light = parseBlock(blockAfter(rawTokens, ':root {'))
const dark = parseBlock(blockAfter(rawTokens, ":root[data-theme='dark']"))
const darkBySystemPreference = parseBlock(blockAfter(rawTokens, '@media (prefers-color-scheme: dark)'))

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

function ratio(theme: Theme, pair: Pair): number {
  const text = theme[pair.text]
  const background = theme[pair.background]
  if (!text || !background) throw new Error(`Falta el token ${pair.text} o ${pair.background}`)
  return contrast(text, background)
}

describe('tokens.css · contraste AA del texto', () => {
  it('el tema oscuro por preferencia del sistema y [data-theme="dark"] declaran los mismos valores', () => {
    expect(darkBySystemPreference).toEqual(dark)
  })

  it('el tema claro y el oscuro declaran los mismos tokens', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
  })

  for (const [themeName, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    describe(`tema ${themeName === 'light' ? 'claro' : 'oscuro'}`, () => {
      for (const pair of PAIRS) {
        const name = `${pair.text} sobre ${pair.background} ≥ 4,5:1`
        const check = () => expect(ratio(theme, pair), name).toBeGreaterThanOrEqual(4.5)
        // `it.fails` documenta el par pendiente y obliga a convertirlo en test normal cuando se corrige.
        if (pair.pending?.[themeName]) it.fails(`${name} (pendiente: ${pair.pending[themeName]})`, check)
        else it(name, check)
      }
    })
  }
})
