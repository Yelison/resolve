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
 *
 * Colores de los espacios (`workspace-tokens.css`): las iniciales (`workspace-ink`, blanco) sobre cada uno de los 8 colores
 * del espacio, ≥ 4,5:1 en los dos temas (1.4.3, son texto).
 *
 * Los colores de la interfaz salen de `tokens.css` (generado desde `@yelison/forma-ui`); los de los gráficos, de
 * `chart-tokens.css`, y los de los espacios, de `workspace-tokens.css`, capas propias de Resolve. */

type Theme = Readonly<Record<string, string>>

const WORKSPACE_COLORS = ['blue', 'green', 'magenta', 'orange', 'violet', 'teal', 'brick', 'slate'] as const
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
  // Iniciales del cuadro de cada espacio (1.4.3): blanco sobre su color.
  ...WORKSPACE_COLORS.map((color) => ({ text: 'workspace-ink', background: `workspace-${color}` })),
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
// Los colores de los gráficos son de Resolve, no del paquete: viven en su propia hoja, con los mismos tres bloques que
// `tokens.css`. Cada tema es la unión de los dos bloques homólogos.
const rawChartTokens = readFileSync(join(process.cwd(), 'src/styles/chart-tokens.css'), 'utf8')

const rawWorkspaceTokens = readFileSync(join(process.cwd(), 'src/styles/workspace-tokens.css'), 'utf8')

const themeBlock = (selector: string): Theme => ({
  ...parseBlock(blockAfter(rawTokens, selector)),
  ...parseBlock(blockAfter(rawChartTokens, selector)),
  ...parseBlock(blockAfter(rawWorkspaceTokens, selector)),
})

const light = themeBlock(':root {')
const dark = themeBlock(":root[data-theme='dark']")
const darkBySystemPreference = themeBlock('@media (prefers-color-scheme: dark)')

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

  it('cada clave de color de espacio declara su valor en los dos temas', () => {
    for (const color of WORKSPACE_COLORS) {
      expect(light[`workspace-${color}`], `claro ${color}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(dark[`workspace-${color}`], `oscuro ${color}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
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

/* Los 8 colores de los espacios también se distinguen entre sí: el color nunca va solo (hay iniciales y nombre), pero en
 * el selector y en «Tus espacios» es la pista rápida entre dos espacios. Diferencia CIEDE2000 mínima entre cada par, con
 * la visión normal y simulando protanopia, deuteranopia y tritanopia (Machado et al. 2009, severidad 1). Los mínimos se
 * eligen para que la paleta actual pase y el violeta oscuro anterior (#7459e6, 2,0 con el azul en protanopia y 2,3 en
 * deuteranopia) falle. Los pares más cercanos hoy: azul/violeta en deuteranopia y verde/turquesa o naranja/teja en
 * tritanopia (3,5 a 3,9): quedan a tres unidades, no a ninguna, y ninguno es la única pista de un espacio. */
const MIN_DELTA_E = { normal: 9, protan: 6, deutan: 3.5, tritan: 3 } as const
const MACHADO = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
} as const

function toLab(hex: string, condition: keyof typeof MACHADO): [number, number, number] {
  const linear = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const m = MACHADO[condition]
  const [r, g, b] = [0, 3, 6].map(
    (k) => (m[k] ?? 0) * linear[0] + (m[k + 1] ?? 0) * linear[1] + (m[k + 2] ?? 0) * linear[2],
  ) as [number, number, number]
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

function deltaE2000(
  [L1, a1, b1]: number[] & [number, number, number],
  [L2, a2, b2]: number[] & [number, number, number],
) {
  const rad = (d: number) => (d * Math.PI) / 180
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360)
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))
  const ap1 = (1 + g) * a1
  const ap2 = (1 + g) * a2
  const cp1 = Math.hypot(ap1, b1)
  const cp2 = Math.hypot(ap2, b2)
  const h1 = hue(b1, ap1)
  const h2 = hue(b2, ap2)
  let dh = 0
  if (cp1 * cp2 !== 0) {
    dh = h2 - h1
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
  }
  const dL = L2 - L1
  const dC = cp2 - cp1
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(rad(dh / 2))
  const lBar = (L1 + L2) / 2
  const cpBar = (cp1 + cp2) / 2
  let hBar = h1 + h2
  if (cp1 * cp2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hBar += h1 + h2 < 360 ? 360 : -360
    hBar /= 2
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63))
  const rc = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7))
  const rt = -Math.sin(rad(2 * 30 * Math.exp(-(((hBar - 275) / 25) ** 2)))) * rc
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2)
  const sc = 1 + 0.045 * cpBar
  const sh = 1 + 0.015 * cpBar * t
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh))
}

describe('workspace-tokens.css · los 8 colores se distinguen entre sí', () => {
  for (const [themeName, theme] of [
    ['claro', light],
    ['oscuro', dark],
  ] as const) {
    for (const condition of ['normal', 'protan', 'deutan', 'tritan'] as const) {
      it(`tema ${themeName}, ${condition}: ΔE2000 ≥ ${MIN_DELTA_E[condition]} en los 28 pares`, () => {
        for (const [i, a] of WORKSPACE_COLORS.entries()) {
          for (const b of WORKSPACE_COLORS.slice(i + 1)) {
            const distance = deltaE2000(
              toLab(theme[`workspace-${a}`]!, condition),
              toLab(theme[`workspace-${b}`]!, condition),
            )
            expect(distance, `${a}/${b}`).toBeGreaterThanOrEqual(MIN_DELTA_E[condition])
          }
        }
      })
    }
  }
})
