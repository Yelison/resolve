let segmenter: Intl.Segmenter | undefined

/** Los caracteres que percibe una persona: una letra con su acento combinado o un emoji no se parten. */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text)
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), ({ segment }) => segment)
}

/** El primer carácter percibido, en mayúscula; si su mayúscula son dos letras (`ß` → `SS`) se queda como está. */
function capitalOf(word: string): string {
  const [first = ''] = graphemes(word)
  const upper = first.toUpperCase()
  return graphemes(upper).length === 1 ? upper : first
}

/**
 * Primera letra del nombre y del último apellido, en mayúsculas.
 *
 * Es la misma lógica que `Avatar` de `@yelison/forma-ui` (≥ 0.4.0), que no exporta el ayudante: `WorkspaceMark` lo usa
 * para las iniciales de un espacio, y así el espacio y el avatar las calculan igual. `initials.test.tsx` compara las dos.
 * Pendiente para Forma UI: exportarlo y borrar este archivo.
 */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const first = words[0] === undefined ? '' : capitalOf(words[0])
  const last = words.length > 1 ? capitalOf(words[words.length - 1] ?? '') : ''
  return first + last
}
