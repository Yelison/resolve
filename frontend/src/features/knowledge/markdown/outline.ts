import ReactMarkdown from 'react-markdown'
import { remarkArticle, type HeadingEntry } from './remarkArticle'

export type OutlineEntry = HeadingEntry

/**
 * Índice del artículo para el panel «En este artículo»: los encabezados `##` y `###` que `ArticleBody` dibuja, en
 * orden, con sus mismos ids. Sale del árbol de Markdown y no de las líneas del texto, así que no incluye lo que está
 * dentro de código o de HTML descartado, y el texto es el que se ve (entidades y escapes resueltos).
 *
 * Importa `react-markdown`: desde una ruta que no sea diferida lo arrastraría al paquete principal.
 */
export function outline(source: string): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  // `Markdown` es una función pura (sin hooks): se ejecuta solo por su efecto en el plugin, igual que al dibujar.
  ReactMarkdown({
    children: source,
    skipHtml: true,
    remarkPlugins: [[remarkArticle, { onHeading: (e: HeadingEntry) => entries.push(e) }]],
  })
  return entries
}
