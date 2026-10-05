const WORDS_PER_MINUTE = 200

/** Minutos de lectura estimados: palabras entre 200, redondeado hacia arriba y con un mínimo de 1. */
export function readingTimeMinutes(source: string): number {
  const words = source.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}
