import { describe, expect, it } from 'vitest'
import mainSource from '../main.tsx?raw'

describe('punto de entrada (main.tsx)', () => {
  /** Sin comentarios: uno que nombre el componente no lo cuenta. */
  const source = mainSource.replace(/\/\/.*$/gm, '')

  it('instala los proveedores (FormaProvider incluido) por encima del router, para cubrir /entrar, el catálogo y la demostración', () => {
    expect(source).toMatch(/<AppProviders[^>]*>\s*<RouterProvider[^>]*\/>\s*<\/AppProviders>/)
  })
})
