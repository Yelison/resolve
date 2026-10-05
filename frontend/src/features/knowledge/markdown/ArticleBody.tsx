import { useMemo, type ComponentPropsWithoutRef, type ReactElement } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import { locatedOutline } from './outline'

/**
 * Elementos que se dibujan. Todo lo demás (imágenes, código, tablas, citas, encabezados de otros niveles) se muestra
 * como su texto gracias a `unwrapDisallowed`.
 */
const ALLOWED_ELEMENTS = ['h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a']

const ABSOLUTE_HTTP = /^https?:\/\//i

/**
 * Enlace del artículo. `urlTransform` (el de por defecto) deja `href` vacío para `javascript:`, `data:` y otros
 * esquemas: ese enlace se dibuja como texto, sin `<a>`.
 */
function SafeLink({ href, children }: ComponentPropsWithoutRef<'a'> & ExtraProps) {
  if (!href) return <>{children}</>
  const external = ABSOLUTE_HTTP.test(href)
  return (
    <a href={href} rel="noopener noreferrer" target={external ? '_blank' : undefined}>
      {children}
    </a>
  )
}

/** Encabezado con el id del índice: se busca por la línea del texto, así coincide con `outline` aunque haya repetidos. */
function heading(level: 2 | 3, ids: Map<number, string>) {
  const Tag = `h${level}` as const
  return function Heading({ node, children }: ComponentPropsWithoutRef<'h2'> & ExtraProps) {
    const line = node?.position?.start.line
    return <Tag id={line === undefined ? undefined : ids.get(line)}>{children}</Tag>
  }
}

/**
 * Cuerpo de un artículo en Markdown. El texto se trata como no fiable: `react-markdown` lo convierte en elementos de
 * React, el HTML en bruto se descarta (`skipHtml`) y nunca se inserta como HTML.
 */
export function ArticleBody({ source }: { source: string }): ReactElement {
  const components = useMemo<Components>(() => {
    const ids = new Map(locatedOutline(source).map((entry) => [entry.line, entry.id]))
    return { a: SafeLink, h2: heading(2, ids), h3: heading(3, ids) }
  }, [source])
  return (
    <ReactMarkdown skipHtml allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed components={components}>
      {source}
    </ReactMarkdown>
  )
}
