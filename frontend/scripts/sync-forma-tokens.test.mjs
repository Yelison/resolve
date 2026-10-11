import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPalettes, buildTokens, header, PALETTE_TOKENS, readPackage } from './sync-forma-tokens.mjs'

test('la cabecera nombra la versión y no contiene los selectores que los tests de tokens buscan por texto', () => {
  const text = header('1.2.3')
  assert.match(text, /@yelison\/forma-ui@1\.2\.3/)
  assert.doesNotMatch(text, /:root|@media|data-theme/)
  assert.equal(text.split('*/').length, 2, 'un solo comentario')
})

test('la copia es la cabecera seguida del archivo del paquete, sin cambios', () => {
  const { version, css } = readPackage()
  const built = buildTokens(version, css)
  assert.ok(built.startsWith(header(version)))
  assert.equal(built.slice(header(version).length), css)
})

test('el módulo de paletas lleva los cinco colores de las miniaturas en cada tema, con los valores del paquete', () => {
  const { version, tokens } = readPackage()
  const built = buildPalettes(version, tokens)
  assert.match(built, /^\/\* Generado desde `@yelison\/forma-ui@/)
  for (const theme of ['light', 'dark']) {
    for (const token of PALETTE_TOKENS)
      assert.ok(built.includes(`'${token}': '${tokens[theme][token]}',`), `${theme} ${token}`)
  }
})

test('falla si el paquete no define un color de las miniaturas', () => {
  assert.throws(() => buildPalettes('1.2.3', { light: {}, dark: {} }), /no define --color-nav en el tema light/)
})
