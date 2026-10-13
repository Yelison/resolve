import type { FormEvent } from 'react'
import { Button, SearchField } from '../../components/ui'
import styles from './KnowledgeHero.module.css'

export interface KnowledgeHeroProps {
  /** Un cliente no ve la cifra del personal: ve una invitación a buscar. */
  audience: 'staff' | 'customer'
  /**
   * Artículos que quien consulta puede leer, sumados de las categorías: no cambia con la búsqueda. `undefined` mientras
   * carga (la línea reserva su sitio) y `null` si no se pudo saber.
   */
  articleCount: number | null | undefined
  value: string
  onValueChange: (value: string) => void
  /** Envía la búsqueda al momento, sin esperar al debounce. */
  onSubmit: () => void
}

const GENERIC_LEAD = 'Busca en tu base de conocimiento o empieza por una categoría.'

function Lead({ articleCount, audience }: Pick<KnowledgeHeroProps, 'articleCount' | 'audience'>) {
  if (audience === 'customer') {
    return <>Busca una respuesta o empieza por un tema.</>
  }
  if (articleCount === null) return <>{GENERIC_LEAD}</>
  if (articleCount === 0) return <>Todavía no hay artículos en tu base de conocimiento.</>
  if (articleCount === 1) return <>Busca en el único artículo de tu base de conocimiento o empieza por una categoría.</>
  return (
    <>
      Busca en los{' '}
      {articleCount === undefined ? (
        <span className={styles.pending} aria-hidden="true" />
      ) : (
        <strong className={styles.count}>{articleCount}</strong>
      )}{' '}
      artículos de tu base de conocimiento o empieza por una categoría.
    </>
  )
}

/**
 * Cabecera del centro de ayuda: el `h1` de la página, una línea de apoyo con el número de artículos y el buscador. El
 * campo es el mismo de siempre (misma consulta, mismo debounce, misma URL); el botón solo adelanta el envío.
 */
export function KnowledgeHero({ audience, articleCount, value, onValueChange, onSubmit }: KnowledgeHeroProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>
        {audience === 'customer' ? '¿En qué podemos ayudarte?' : '¿Qué necesitas resolver?'}
      </h1>
      <p className={styles.lead} aria-busy={audience === 'staff' && articleCount === undefined}>
        <Lead articleCount={articleCount} audience={audience} />
      </p>
      <form role="search" className={styles.search} onSubmit={submit}>
        <SearchField
          label="Buscar artículos"
          placeholder="Por ejemplo: recuperar contraseña"
          value={value}
          onValueChange={onValueChange}
          fieldClassName={styles.field}
          className={styles.input}
        />
        <Button type="submit" className={styles.submit}>
          Buscar
        </Button>
      </form>
    </section>
  )
}
