import type { ComponentProps } from 'react'
import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import styles from './FilterChip.module.css'

export interface FilterChipProps extends ComponentProps<'button'> {
  /** Marca el filtro como aplicado. La etiqueta debe incluir el valor, p. ej. «Estado: Abierto». */
  selected?: boolean
}

/** Disparador de filtro; normalmente abre un Menu con las opciones. */
export function FilterChip({ selected = false, className, children, type = 'button', ...props }: FilterChipProps) {
  return (
    <button type={type} className={cx(styles.chip, selected && styles.selected, className)} {...props}>
      {children}
      <Icon name="chevron" className={styles.chevron} />
    </button>
  )
}
