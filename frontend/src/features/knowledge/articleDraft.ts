/**
 * Borrador local de un artículo: solo lo que el usuario cambió (`null` es «sin tocar», así restaurarlo no revierte lo que
 * otra persona guardó en ese campo) y la versión del servidor sobre la que se escribió (0 en uno nuevo).
 */
export interface ArticleDraft {
  title: string | null
  body: string | null
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
    const text = (field: unknown) => (typeof field === 'string' || field === null ? field : undefined)
    if (text(title) === undefined || text(body) === undefined || typeof version !== 'number') return null
    return { title: text(title) as string | null, body: text(body) as string | null, version }
  } catch {
    return null
  }
}

export const draftKey = (slug: string | undefined) => `resolve-article-${slug ?? 'nuevo'}`
