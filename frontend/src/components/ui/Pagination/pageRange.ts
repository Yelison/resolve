export type PageToken = number | 'gap'

/** Páginas a cada lado de la actual. */
const SIBLINGS = 1

/**
 * Páginas visibles de una paginación: siempre la primera, la última y las vecinas de la actual,
 * con 'gap' donde se omiten páginas, en 7 posiciones fijas para que los botones no salten.
 * Ejemplo: (6, 20) → [1, 'gap', 5, 6, 7, 'gap', 20].
 */
export function pageRange(page: number, pageCount: number): PageToken[] {
  const count = Number.isFinite(pageCount) ? Math.trunc(pageCount) : 0
  if (count <= 0) return []
  const current = clampPage(page, count)
  const siblings = SIBLINGS
  // Primera, última, actual, vecinas y dos huecos.
  const maxVisible = siblings * 2 + 5
  if (count <= maxVisible) return Array.from({ length: count }, (_, index) => index + 1)

  const start = Math.max(2, Math.min(current - siblings, count - siblings * 2 - 2))
  const end = Math.min(count - 1, Math.max(current + siblings, siblings * 2 + 3))
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index)

  return [1, ...(start > 2 ? ['gap' as const] : []), ...middle, ...(end < count - 1 ? ['gap' as const] : []), count]
}

/** Ajusta una página a un entero dentro de [1, pageCount]. */
export function clampPage(page: number, pageCount: number): number {
  const whole = Number.isFinite(page) ? Math.trunc(page) : 1
  return Math.min(Math.max(whole, 1), Math.max(pageCount, 1))
}
