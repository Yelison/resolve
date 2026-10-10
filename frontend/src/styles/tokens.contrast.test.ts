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
 *    surface-hover; los de Metric destacada y TicketRow seleccionada (deltas, urgente) también sobre blue-bg.
 *  - Fondos de estado con texto heredado: las notas internas de Message y Editor (`.note`, amber-bg) llevan `ink` y
 *    `muted`.
 *  - `link` como color de texto: los enlaces de ArticlePage (`.helpText a`) y ArticleProse (`.prose a`), siempre
 *    dentro de tarjetas surface.
 *
 * Quedan fuera, a propósito: el texto deshabilitado (`opacity: .45` sobre cualquier par) y los elementos decorativos
 * o de estado no textual (bordes, `--color-line`, `--color-disabled`, `--color-focus`, `--color-overlay`), que se
 * rigen por 1.4.11 (3:1) y no por 1.4.3.
 *
 * Texto de marca: `link` (referencia a `blue-ink` en los dos temas) es el token de los enlaces de
 * ArticlePage y ArticleProse; `brand` ya no se pinta como texto. El hover del primario es el token `brand-hover`, no
 * una mezcla, para que este test lo vea.
 *
 * No texto (1.4.11, ≥ 3:1): `brand` como relleno de borde o indicador (Checkbox y Radio marcados, Switch, barras y
 * contorno de BarChart) frente a `surface` y `bg`, las series `chart-1…4` de los gráficos frente a `surface`, y como relleno de progreso frente a `progress-track`, la pista de
 * ProgressBar y de la subida de Attachment (token del código, #75: en el tema oscuro `line` y `disabled` dejaban
 * el relleno en 2,52 y 2,14).
 *
 * Rampa secuencial `chart-seq-1…4` (anillo de prioridad y mapa de calor, de más a menos intensa): solo los pasos 1 y 2
 * se exigen a 3:1 frente a `surface`. Los pasos 3 y 4 (2,5 y 1,6 en claro; 3,6 y 1,8 en oscuro) quedan exentos a
 * propósito: no son texto ni la única vía de lectura, porque cada segmento del anillo lleva su valor en la leyenda y el
 * mapa de calor lleva su tabla alternativa, y los segmentos claros llevan un contorno de 1 px en `--color-line` para no
 * fundirse con la superficie.
 *
 * Los valores de `brand`, `brand-hover` y `link` se ajustaron en el código (#65), no en Figma: este test los protege.
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
  /** Mínimo exigido: 4,5 (texto, 1.4.3) o 3 (no texto, 1.4.11). */
  min?: 3 | 4.5
}

const PAIRS: readonly Pair[] = [
  ...(['ink', 'muted'] as const).flatMap((text) => GENERAL_BACKGROUNDS.map((background) => ({ text, background }))),
  ...(['blue-ink', 'green-ink', 'amber-ink', 'red-ink'] as const).flatMap((text) =>
    (['bg', 'surface', 'surface-hover'] as const).map((background) => ({ text, background })),
  ),
  ...(['green-ink', 'amber-ink', 'red-ink'] as const).map((text) => ({ text, background: 'blue-bg' })),
  ...SEMANTIC_PAIRS.map(([text, background]) => ({ text, background })),
  { text: 'ink', background: 'amber-bg' },
  { text: 'muted', background: 'amber-bg' },
  { text: 'link', background: 'surface' },
  { text: 'link', background: 'bg' },
  { text: 'nav-text', background: 'nav' },
  { text: 'nav-text', background: 'nav-active' },
  { text: 'nav-ink', background: 'nav' },
  { text: 'nav-ink', background: 'nav-active' },
  { text: 'on-brand', background: 'brand' },
  { text: 'on-brand', background: 'brand-hover' },
  ...(['surface', 'bg', 'progress-track'] as const).map((background) => ({
    text: 'brand',
    background,
    min: 3 as const,
  })),
  // Series de los gráficos (1.4.11): cada color frente a la superficie del panel que los pinta.
  ...(['chart-1', 'chart-2', 'chart-3', 'chart-4'] as const).map((text) => ({
    text,
    background: 'surface',
    min: 3 as const,
  })),
  // Rampa secuencial (1.4.11): solo los pasos 1 y 2; los pasos 3 y 4 están exentos (ver la cabecera).
  ...(['chart-seq-1', 'chart-seq-2'] as const).map((text) => ({
    text,
    background: 'surface',
    min: 3 as const,
  })),
]

/** Tokens de color del bloque; `var(--color-x)` se resuelve contra el propio bloque (así se ve `link`). */
function parseBlock(css: string): Theme {
  const raw: Record<string, string> = Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6}|var\(--color-[a-z0-9-]+\))\s*;/gi)].map(
      ([, name, value]) => [name, value],
    ),
  )
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const ref = /^var\(--color-([a-z0-9-]+)\)$/.exec(value)?.[1]
      return [name, ref ? (raw[ref] ?? '') : value]
    }),
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
        const min = pair.min ?? 4.5
        const name = pair.min
          ? `${pair.text} sobre ${pair.background}, no texto ≥ 3:1`
          : `${pair.text} sobre ${pair.background} ≥ 4,5:1`
        it(name, () => expect(ratio(theme, pair), name).toBeGreaterThanOrEqual(min))
      }
    })
  }
})
