import { slugify } from './slugify'

/** Lo mínimo del árbol mdast que este plugin lee; así no se importan tipos de paquetes que no son dependencia directa. */
interface ArticleNode {
  type: string
  value?: string
  alt?: string | null
  depth?: number
  children?: ArticleNode[]
  data?: { hProperties?: Record<string, unknown> }
}

export interface HeadingEntry {
  id: string
  level: 2 | 3
  text: string
}

export interface RemarkArticleOptions {
  /** Recibe cada encabezado `##` y `###` que se dibujará, en orden. */
  onHeading?: (heading: HeadingEntry) => void
}

/** Los ids del artículo llevan prefijo: así no chocan con los de la aplicación (`contenido`, `root`…). */
const ID_PREFIX = 'seccion-'

/** Texto visible de un nodo: lo que se dibuja, sin marcas ni HTML (que se descarta), con entidades y escapes resueltos. */
function textOf(node: ArticleNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? ''
  if (node.type === 'break') return ' '
  return (node.children ?? []).map(textOf).join('')
}

/** Sustituye cada imagen por su texto alternativo: no se dibujan imágenes, pero su descripción se conserva. */
function imagesToText(node: ArticleNode) {
  node.children = node.children?.map((child) => {
    if (child.type === 'image' || child.type === 'imageReference') return { type: 'text', value: child.alt ?? '' }
    imagesToText(child)
    return child
  })
}

/** Recorre en orden los encabezados `##`/`###`; `visit` devuelve `false` para descartar el que no tiene texto. */
function headings(node: ArticleNode, visit: (heading: ArticleNode) => boolean) {
  node.children = node.children?.filter((child) => {
    if (child.type === 'heading' && (child.depth === 2 || child.depth === 3) && !visit(child)) return false
    headings(child, visit)
    return true
  })
}

/**
 * Plugin remark del artículo: convierte las imágenes en su texto alternativo y da a cada `##`/`###` un id único por
 * documento (`seccion-` + slug; si el id ya está tomado, se añade `-2`, `-3`… hasta uno libre). `ArticleBody` y
 * `outline()` pasan por este mismo plugin, así que el índice coincide con lo que se dibuja. Un encabezado que se queda
 * sin texto (`## ![](x)`) se descarta: no se dibuja un `h2` vacío ni se indexa.
 */
export function remarkArticle({ onHeading }: RemarkArticleOptions = {}) {
  return (tree: unknown) => {
    const root = tree as ArticleNode
    imagesToText(root)
    const used = new Set<string>()
    headings(root, (heading) => {
      const text = textOf(heading).trim()
      if (!text) return false
      const base = `${ID_PREFIX}${slugify(text)}`
      let id = base
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`
      used.add(id)
      heading.data = { ...heading.data, hProperties: { ...heading.data?.hProperties, id } }
      onHeading?.({ id, level: heading.depth as 2 | 3, text })
      return true
    })
  }
}
