import { Link, type To } from 'react-router'
import { Icon } from '../../components/ui'
import type { Category } from '../../domain/article'
import { cx } from '../../lib/cx'
import type { CategoryTone } from './categoryTones'
import styles from './CategoryCard.module.css'

function articleCountLabel(count: number): string {
  return count === 1 ? '1 artículo' : `${count} artículos`
}

export interface CategoryCardProps {
  category: Category
  tone: CategoryTone
  /** Dirección del filtro de esta categoría; si ya está activo, la que lo quita. */
  to: To
  selected: boolean
}

/**
 * Tarjeta de categoría: icono en una baldosa de color, nombre, descripción y recuento. Es un enlace al filtro de la
 * categoría; con el filtro activo lleva `aria-current` y el mismo enlace lo quita.
 */
export function CategoryCard({ category, tone, to, selected }: CategoryCardProps) {
  return (
    <Link to={to} replace className={cx(styles.card, selected && styles.selected)} aria-current={selected || undefined}>
      <span className={cx(styles.tile, styles[tone])} aria-hidden="true">
        <Icon name="book" size={24} />
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{category.name}</span>
        <span className={styles.description} title={category.description ?? undefined}>
          {category.description}
        </span>
        <span className={styles.count}>{articleCountLabel(category.articles)}</span>
        {selected && <span className="visually-hidden">Filtro activo: pulsa para quitarlo.</span>}
      </span>
    </Link>
  )
}

/** Tarjeta de carga con la misma estructura que `CategoryCard`, para que la página no salte al llegar los datos. */
export function CategoryCardSkeleton() {
  return (
    <div className={cx(styles.card, styles.skeleton)} aria-hidden="true">
      <span className={cx(styles.tile, styles.pending)} />
      <span className={styles.body}>
        <span className={cx(styles.name, styles.bar)} />
        <span className={cx(styles.description, styles.bar)} />
        <span className={cx(styles.count, styles.bar, styles.short)} />
      </span>
    </div>
  )
}
