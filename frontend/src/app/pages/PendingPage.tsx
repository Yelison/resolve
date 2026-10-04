import { EmptyState, type IconName } from '../../components/ui'
import styles from './Page.module.css'
import { PageHeader } from './PageHeader'

export interface PendingPageProps {
  title: string
  icon: IconName
}

/** Sección navegable cuya vista aún no está implementada. Lo dice abiertamente en lugar de simular contenido. */
export function PendingPage({ title, icon }: PendingPageProps) {
  return (
    <div className={styles.page}>
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title="Vista en construcción"
        description={`La sección ${title} llegará en una próxima entrega, siguiendo el diseño de Figma.`}
      />
    </div>
  )
}
