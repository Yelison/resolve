/** Borrador local de un artículo: el texto y la versión del servidor sobre la que se escribió (0 en uno nuevo). */
export interface ArticleDraft {
  title: string
  body: string
  version: number
}

export const serializeDraft = (draft: ArticleDraft) => JSON.stringify(draft)

/** Lee un borrador guardado; cualquier cosa que no tenga la forma esperada (texto viejo, JSON roto) se ignora. */
export function parseDraft(raw: string): ArticleDraft | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { title, body, version } = value as Record<string, unknown>
    if (typeof title !== 'string' || typeof body !== 'string' || typeof version !== 'number') return null
    return { title, body, version }
  } catch {
    return null
  }
}

export const draftKey = (slug: string | undefined) => `resolve-article-${slug ?? 'nuevo'}`
