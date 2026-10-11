// Escribe `src/styles/tokens.css` desde el `tokens.css` de `@yelison/forma-ui`, la copia del tema de Keycloak y el
// módulo con los colores de las miniaturas de tema (`themePalettes.generated.ts`).
//
//   npm run sync:forma-tokens            escribe las tres copias
//   npm run sync:forma-tokens -- --check no escribe nada y falla si alguna no coincide con el paquete instalado
//
// El módulo existe para que `ThemeBlock` no importe el `tokens.json` entero (78 colores por tema) solo por cinco.
// Cada copia es una cabecera propia de Resolve seguida del contenido EXACTO del archivo del paquete. La versión de la
// cabecera es la de la última sincronía: un parche del paquete que no toca los tokens no obliga a cambiarla, y
// `src/styles/tokens.sync.test.ts` solo compara el contenido, no la versión.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = [
  join(FRONTEND, 'src/styles/tokens.css'),
  join(FRONTEND, '../deploy/keycloak/themes/resolve/login/resources/css/tokens.css'),
]
const PALETTES = join(FRONTEND, 'src/features/settings/themePalettes.generated.ts')

/** Los colores que dibujan las miniaturas de tema; `ThemeBlock` no lee ningún otro. */
export const PALETTE_TOKENS = ['--color-nav', '--color-bg', '--color-ink', '--color-surface', '--color-line']

/** Cabecera de las copias. No debe nombrar los bloques de `tokens.css` (`:root {`…): los tests los buscan por texto. */
export function header(version) {
  return `/* Generado desde \`@yelison/forma-ui@${version}\` (la versión de la última sincronía): no lo edites a mano.
 * Ejecuta \`npm run sync:forma-tokens\` para regenerarlo; la misma orden escribe la copia del tema de Keycloak
 * (\`deploy/keycloak/themes/resolve/login/resources/css/tokens.css\`), que debe ser idéntica a este archivo.
 * Debajo va, sin cambios, el \`tokens.css\` del paquete. Los tokens propios de Resolve están en \`global.css\` (diseño de
 * la aplicación) y en \`chart-tokens.css\` (gráficos). \`tokens.sync.test.ts\` falla si el contenido difiere del paquete. */

`
}

export function buildTokens(version, packageCss) {
  return header(version) + packageCss
}

/** Módulo TypeScript (ya con el formato de Prettier) con `PALETTE_TOKENS` de cada tema de `tokens.json`. */
export function buildPalettes(version, tokens) {
  const theme = (name) =>
    PALETTE_TOKENS.map((token) => {
      const value = tokens[name]?.[token]
      if (typeof value !== 'string') throw new Error(`tokens.json no define ${token} en el tema ${name}`)
      return `    '${token}': '${value}',`
    }).join('\n')
  return `/* Generado desde \`@yelison/forma-ui@${version}\` (la versión de la última sincronía): no lo edites a mano.
 * Ejecuta \`npm run sync:forma-tokens\` para regenerarlo. \`themePalettes.test.ts\` falla si difiere del paquete. */

/** Colores de cada tema que usan las miniaturas de \`ThemeBlock\`. */
export const themePalettes = {
  light: {
${theme('light')}
  },
  dark: {
${theme('dark')}
  },
} as const
`
}

/** Resuelve por `exports`, no por la estructura de `dist/`, que el paquete puede cambiar. */
export function readPackage(frontend = FRONTEND) {
  const require = createRequire(join(frontend, 'package.json'))
  return {
    version: JSON.parse(readFileSync(require.resolve('@yelison/forma-ui/package.json'), 'utf8')).version,
    css: readFileSync(require.resolve('@yelison/forma-ui/tokens.css'), 'utf8'),
    tokens: JSON.parse(readFileSync(require.resolve('@yelison/forma-ui/tokens.json'), 'utf8')),
  }
}

function main(check) {
  const { version, css, tokens } = readPackage()
  const stale = []
  for (const target of TARGETS) {
    const expected = buildTokens(version, css)
    let current = null
    try {
      current = readFileSync(target, 'utf8')
    } catch {
      /* no existe: se crea */
    }
    // Solo el contenido decide: la versión de la cabecera es la de la última sincronía.
    const body = (text) => text?.slice(text.indexOf('*/\n\n') + 4)
    if (body(current) !== css) stale.push(target)
    if (!check) writeFileSync(target, expected)
  }
  // Como en las copias, solo decide el contenido: la versión de la cabecera es la de la última sincronía.
  const palettes = (text) => text?.slice(text.indexOf('*/\n\n') + 4)
  let currentPalettes = null
  try {
    currentPalettes = readFileSync(PALETTES, 'utf8')
  } catch {
    /* no existe: se crea */
  }
  const expectedPalettes = buildPalettes(version, tokens)
  if (palettes(currentPalettes) !== palettes(expectedPalettes)) stale.push(PALETTES)
  if (!check) writeFileSync(PALETTES, expectedPalettes)
  if (check) {
    for (const target of stale) console.error(`desfasado: ${target}`)
    if (stale.length > 0) {
      console.error('Ejecuta `npm run sync:forma-tokens`.')
      process.exit(1)
    }
    console.log(`tokens.css coincide con @yelison/forma-ui@${version}`)
  } else {
    console.log(
      `tokens.css escrito desde @yelison/forma-ui@${version} (${TARGETS.length} copias) y las paletas de las miniaturas`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.includes('--check'))
