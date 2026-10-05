import { Icon } from '../../components/ui'
import type { Category } from '../../domain/article'
import { cx } from '../../lib/cx'
import styles from './CategoryCard.module.css'

export interface CategoryCardProps {
  category: Category
  selected: boolean
  onSelect: (category: Category) => void
}

/** Tarjeta de categoría que actúa como filtro: pulsarla filtra la lista y volver a pulsarla quita el filtro. */
export function CategoryCard({ category, selected, onSelect }: CategoryCardProps) {
  const count = category.articles === 1 ? '1 artículo' : `${category.articles} artículos`
  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.selected)}
      aria-pressed={selected}
      onClick={() => onSelect(category)}
    >
      <Icon name="book" size={24} className={styles.icon} />
      <span className={styles.name}>{category.name}</span>
      <span className={styles.meta}>{category.description ? `${category.description} · ${count}` : count}</span>
    </button>
  )
}
