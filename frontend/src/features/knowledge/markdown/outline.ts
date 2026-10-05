import { slugify } from './slugify'

export interface OutlineEntry {
  id: string
  level: 2 | 3
  text: string
}

/** Entrada con la línea (desde 1) del encabezado en el texto: `ArticleBody` la usa para asignar el mismo id. */
export interface LocatedOutlineEntry extends OutlineEntry {
  line: number
}

const HEADING = /^ {0,3}(#{2,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/** Texto visible de un encabezado: sin enlaces ni marcas de énfasis o de código. */
function plainText(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
}

/** Encabezados `##` y `###` del texto, en orden, con ids únicos por documento. Ignora los bloques de código. */
export function locatedOutline(source: string): LocatedOutlineEntry[] {
  const used = new Map<string, number>()
  const entries: LocatedOutlineEntry[] = []
  let fence: string | null = null
  source.split(/\r\n|\r|\n/).forEach((line, index) => {
    const opening = FENCE.exec(line)?.[1]?.charAt(0)
    if (opening) {
      if (fence === null) fence = opening
      else if (opening === fence) fence = null
      return
    }
    if (fence !== null) return
    const match = HEADING.exec(line)
    const hashes = match?.[1]
    if (!hashes) return
    const text = plainText(match?.[2] ?? '')
    if (!text) return
    const base = slugify(text)
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    entries.push({
      id: count === 1 ? base : `${base}-${count}`,
      level: hashes.length as 2 | 3,
      text,
      line: index + 1,
    })
  })
  return entries
}

/** Índice del artículo para el panel «En este artículo». */
export function outline(source: string): OutlineEntry[] {
  return locatedOutline(source).map(({ id, level, text }) => ({ id, level, text }))
}
