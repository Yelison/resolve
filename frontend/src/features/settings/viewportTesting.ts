import { vi } from 'vitest'

/** Si la media query `(min-width: Npx)` o `(max-width: Npx)` coincide con un ancho de ventana. */
function matches(query: string, width: number) {
  const min = /\(min-width:\s*([\d.]+)px\)/.exec(query)
  const max = /\(max-width:\s*([\d.]+)px\)/.exec(query)
  // Las demás (`prefers-color-scheme`, `prefers-reduced-motion`…) no coinciden, como en jsdom.
  if (!min && !max) return false
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
}

/** Hace que `matchMedia` responda como una ventana de `width` px (jsdom no coincide con ninguna por defecto: móvil). */
export function mockViewport(width: number) {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: matches(query, width),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

/** Hace que los elementos midan `width` px de ancho para `useElementWidth` (jsdom no mide ni observa nada). */
export function mockElementWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 0,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 0,
    toJSON: () => ({}),
  })
}
