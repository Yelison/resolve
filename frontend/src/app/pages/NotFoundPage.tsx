import { Link } from 'react-router'
import { buttonClassName, EmptyState } from '../../components/ui'
import styles from './Page.module.css'
import { PageHeader } from './PageHeader'

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Página no encontrada" />
      <EmptyState
        kind="noResults"
        title="Esta dirección no existe"
        description="Revisa el enlace o vuelve al resumen."
        action={
          <Link to="/" className={buttonClassName()}>
            Ir al resumen
          </Link>
        }
      />
    </div>
  )
}
