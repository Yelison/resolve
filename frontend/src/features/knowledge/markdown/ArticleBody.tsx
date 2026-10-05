import type { ComponentPropsWithoutRef, ReactElement } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import { remarkArticle } from './remarkArticle'

/**
 * Elementos que se dibujan. Todo lo demás (código, tablas, citas, encabezados de otros niveles) se muestra como su
 * texto gracias a `unwrapDisallowed`; las imágenes no tienen hijos, así que `remarkArticle` las pasa a su texto alternativo.
 */
const ALLOWED_ELEMENTS = ['h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a']

/** `http(s)://…` y también `//host`, que el navegador resuelve como otro dominio. */
const EXTERNAL = /^(https?:)?\/\//i

/**
 * Enlace del artículo. `urlTransform` (el de por defecto) deja `href` vacío para `javascript:`, `data:` y otros
 * esquemas: ese enlace se dibuja como texto, sin `<a>`.
 */
function SafeLink({ href, children }: ComponentPropsWithoutRef<'a'> & ExtraProps) {
  if (!href) return <>{children}</>
  const external = EXTERNAL.test(href)
  return (
    <a href={href} rel="noopener noreferrer" target={external ? '_blank' : undefined}>
      {children}
    </a>
  )
}

const REMARK_PLUGINS = [remarkArticle]
const COMPONENTS = { a: SafeLink }

/**
 * Cuerpo de un artículo en Markdown. El texto se trata como no fiable: `react-markdown` lo convierte en elementos de
 * React, el HTML en bruto se descarta (`skipHtml`) y nunca se inserta como HTML.
 */
export function ArticleBody({ source }: { source: string }): ReactElement {
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      remarkPlugins={REMARK_PLUGINS}
      components={COMPONENTS}
    >
      {source}
    </ReactMarkdown>
  )
}
