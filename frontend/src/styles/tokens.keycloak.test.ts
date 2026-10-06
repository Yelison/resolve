/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* El tema de inicio de sesión de Keycloak (deploy/keycloak/themes/resolve) pinta con los mismos colores que la app.
 *
 * Una sola fuente de verdad: el tema lleva una copia LITERAL de `tokens.css` (css/tokens.css) y este test falla si
 * diverge. Para actualizarla: `cp frontend/src/styles/tokens.css deploy/keycloak/themes/resolve/login/resources/css/`.
 * Se eligió un test y no un script generador porque la copia no necesita un paso de build (Keycloak sirve el CSS tal
 * cual) y porque así `tokens.css` sigue siendo un archivo generado desde Figma que nadie toca a mano.
 *
 * Además comprueba que `resolve.css` no pinta con colores sueltos y que los pares texto/fondo que pinta la página de
 * Keycloak cumplen AA (≥ 4,5:1), con los tokens de la app (incluidos `brand-hover` y `link`, de #65) y no con colores
 * propios del tema.
 */

/** Colores con nombre de CSS: `white` en un `background` se salta tokens.css igual que un hexadecimal. */
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue
  chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
  darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
  darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen
  lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
  olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver
  skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen canvas canvastext field fieldtext linktext visitedtext activetext buttonface buttontext
  buttonborder highlight highlighttext graytext mark marktext accentcolor accentcolortext`.split(/\s+/),
)

const THEME = join(process.cwd(), '../deploy/keycloak/themes/resolve/login/resources/css')
const appTokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const themeTokens = readFileSync(join(THEME, 'tokens.css'), 'utf8')
const themeStyles = readFileSync(join(THEME, 'resolve.css'), 'utf8')

type Theme = Readonly<Record<string, string>>

/** Tokens de color del bloque; `var(--color-x)` se resuelve contra el propio bloque (así se ve `link`). */
function parseBlock(css: string): Theme {
  const raw: Record<string, string> = Object.fromEntries(
    [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6}|var\(--color-[a-z-]+\))\s*;/gi)].map(([, name, value]) => [
      name,
      value,
    ]),
  )
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const ref = /^var\(--color-([a-z-]+)\)$/.exec(value)?.[1]
      return [name, ref ? (raw[ref] ?? '') : value]
    }),
  )
}

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

const light = parseBlock(blockAfter(themeTokens, ':root {'))
// El tema oscuro llega por prefers-color-scheme (el que usa Keycloak, que no tiene [data-theme]).
const dark = parseBlock(blockAfter(themeTokens, '@media (prefers-color-scheme: dark)'))

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

interface Pair {
  text: string
  background: string
  /** Dónde lo pinta la página de Keycloak. */
  where: string
  pending?: Partial<Record<'light' | 'dark', string>>
}

const PAIRS: readonly Pair[] = [
  { text: 'ink', background: 'bg', where: 'texto de la página' },
  { text: 'ink', background: 'surface', where: 'tarjeta: título, etiquetas, campos' },
  { text: 'ink', background: 'surface-hover', where: 'campo de solo lectura y hover de botones secundarios' },
  { text: 'muted', background: 'surface', where: 'textos secundarios de la tarjeta' },
  { text: 'red-ink', background: 'surface', where: 'error bajo el campo' },
  { text: 'red-ink', background: 'red-bg', where: 'aviso de error' },
  { text: 'blue-ink', background: 'blue-bg', where: 'aviso informativo' },
  { text: 'amber-ink', background: 'amber-bg', where: 'aviso de advertencia' },
  { text: 'green-ink', background: 'green-bg', where: 'aviso de éxito' },
  { text: 'link', background: 'surface', where: 'enlaces (--color-link)' },
  { text: 'on-brand', background: 'brand', where: 'botón primario y marca' },
  { text: 'on-brand', background: 'brand-hover', where: 'botón primario en hover y foco (--color-brand-hover)' },
]

describe('tema de Keycloak · una sola fuente de verdad', () => {
  it('css/tokens.css es una copia literal de frontend/src/styles/tokens.css', () => {
    expect(themeTokens).toBe(appTokens)
  })

  it('resolve.css solo pinta con variables de tokens.css: ni colores sueltos ni variables inexistentes', () => {
    const withoutComments = themeStyles.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments.match(/#[0-9a-f]{3,8}\b/gi) ?? [], 'colores hexadecimales').toEqual([])
    expect(
      withoutComments.match(/\b(?:rgba?|hsla?|oklch|oklab|hwb|lab|lch|color-mix|color)\(/gi) ?? [],
      'funciones de color',
    ).toEqual([])
    // Colores con nombre: solo `transparent`, `currentColor` e `inherit` (y `none`, `unset`…) valen sin pasar por un token.
    const named = [...withoutComments.matchAll(/(?:^|[;{])\s*([a-z-]+|--[a-z0-9_-]+)\s*:\s*([^;{}]+)/g)]
      .filter(
        ([, property = '']) =>
          !/^(?:font|content|display|width|height|margin|padding|gap|grid|flex|transition|animation)/.test(property),
      )
      .flatMap(([, property = '', value = '']) =>
        value
          .replace(/var\([^)]*\)/g, '')
          .replace(/url\([^)]*\)/g, '')
          .replace(/'[^']*'|"[^"]*"/g, '')
          .split(/[^a-zA-Z-]+/)
          .filter((word) => NAMED_COLORS.has(word.toLowerCase()))
          .map((word) => `${property}: ${word}`),
      )
    expect(named, 'colores con nombre').toEqual([])
    const known = new Set([...themeTokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name = '']) => name))
    const own = new Set([...withoutComments.matchAll(/(--[a-z0-9_-]+)\s*:/g)].map(([, name = '']) => name))
    const used = [...withoutComments.matchAll(/var\((--[a-z0-9_-]+)/g)].map(([, name = '']) => name)
    const unknown = used.filter((name) => !known.has(name) && !own.has(name) && !name.startsWith('--pf-'))
    expect(unknown).toEqual([])
  })

  it('el tema usa los tokens pensados para el texto de marca y el hover: link, no brand, y brand-hover', () => {
    const css = themeStyles.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css.match(/(?:^|[^-\w])color\s*:\s*var\(--color-brand\)/g) ?? [], 'brand como color de texto').toEqual([])
    const hover = /\.pf-v5-c-button\.pf-m-primary:hover[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(hover, 'hover del botón primario').toMatch(/background:\s*var\(--color-brand-hover\)\s*;/)
  })

  for (const [themeName, theme] of [
    ['claro', light],
    ['oscuro', dark],
  ] as const) {
    describe(`contraste AA · tema ${themeName}`, () => {
      it('declara todos los tokens que usan los pares', () => {
        for (const pair of PAIRS) {
          expect(theme[pair.text], pair.text).toBeDefined()
          expect(theme[pair.background], pair.background).toBeDefined()
        }
      })

      for (const pair of PAIRS) {
        const name = `${pair.text} sobre ${pair.background} ≥ 4,5:1 (${pair.where})`
        const check = () =>
          expect(
            contrast(theme[pair.text] ?? '#000000', theme[pair.background] ?? '#000000'),
            name,
          ).toBeGreaterThanOrEqual(4.5)
        const pending = pair.pending?.[themeName === 'claro' ? 'light' : 'dark']
        if (pending) it.fails(`${name} (pendiente: ${pending})`, check)
        else it(name, check)
      }
    })
  }
})
