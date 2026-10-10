import { describe, expect, it } from 'vitest'
import mainSource from '../main.tsx?raw'

describe('punto de entrada (main.tsx)', () => {
  /** Sin comentarios: uno que nombre el componente no lo cuenta. */
  const source = mainSource.replace(/\/\/.*$/gm, '')

  it('instala los proveedores (FormaProvider incluido) por encima del router, para cubrir /entrar, el catálogo y la demostración', () => {
    // Dentro de `<AppProviders …>`, sin fijar qué otros elementos (un modo estricto, un error boundary) lo rodean.
    expect(source).toMatch(/<AppProviders\b[^>]*>[\s\S]*<RouterProvider\b[\s\S]*<\/AppProviders>/)
  })
})
