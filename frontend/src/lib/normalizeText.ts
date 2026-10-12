/** Minúsculas y sin acentos: «clinica» encuentra «Clínica». Para filtrar listas por lo que la persona teclea. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
