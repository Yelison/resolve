import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTokens, header, readPackage } from './sync-forma-tokens.mjs'

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
