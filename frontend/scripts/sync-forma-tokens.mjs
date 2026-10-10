// Escribe `src/styles/tokens.css` desde el `tokens.css` de `@yelison/forma-ui` y la copia del tema de Keycloak.
//
//   npm run sync:forma-tokens            escribe las dos copias
//   npm run sync:forma-tokens -- --check no escribe nada y falla si alguna no coincide con el paquete instalado
//
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

/** Resuelve por `exports`, no por la estructura de `dist/`, que el paquete puede cambiar. */
export function readPackage(frontend = FRONTEND) {
  const require = createRequire(join(frontend, 'package.json'))
  return {
    version: JSON.parse(readFileSync(require.resolve('@yelison/forma-ui/package.json'), 'utf8')).version,
    css: readFileSync(require.resolve('@yelison/forma-ui/tokens.css'), 'utf8'),
  }
}

function main(check) {
  const { version, css } = readPackage()
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
  if (check) {
    for (const target of stale) console.error(`desfasado: ${target}`)
    if (stale.length > 0) {
      console.error('Ejecuta `npm run sync:forma-tokens`.')
      process.exit(1)
    }
    console.log(`tokens.css coincide con @yelison/forma-ui@${version}`)
  } else {
    console.log(`tokens.css escrito desde @yelison/forma-ui@${version} (${TARGETS.length} copias)`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.includes('--check'))
