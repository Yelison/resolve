import { useId } from 'react'
import type { OrganizationColor } from '../../api/schema'
import { Icon } from '../../components/ui'
import { WorkspaceMark } from '../../components/ui/Sidebar/WorkspaceMark'
import { workspaceColorLabel, workspaceColors } from './workspaceColors'
import styles from './WorkspaceColorField.module.css'

/**
 * «Color» del espacio: un grupo de 8 muestras (radios nativos, con flechas y Espacio) y la tarjeta del espacio con el
 * color elegido. Las muestras no usan `Radio` de Forma UI: ese componente es un control de 20 px con su texto al lado, y
 * aquí el control es la muestra misma, de 44 px. El color nunca va solo: cada muestra tiene su nombre accesible y la
 * elegida lleva un check y un anillo.
 */
export function WorkspaceColorField({
  value,
  name,
  role,
  onChange,
  hint,
  error,
}: {
  value: OrganizationColor
  /** Nombre del espacio tal como se está editando, para la vista previa. */
  name: string
  /** Tu rol en el espacio, como lo muestra la tarjeta. */
  role: string
  onChange: (color: OrganizationColor) => void
  hint?: string
  error?: string
}) {
  const describedBy = useId()
  const described = hint || error
  return (
    <div className={styles.field}>
      <fieldset className={styles.group} aria-describedby={described ? describedBy : undefined}>
        <legend className={styles.legend}>Color del espacio</legend>
        <div className={styles.swatches}>
          {workspaceColors.map((color) => (
            <label key={color.key} className={styles.swatch}>
              <input
                type="radio"
                name="color"
                value={color.key}
                checked={value === color.key}
                className={styles.input}
                onChange={() => onChange(color.key)}
              />
              <span aria-hidden="true" data-color={color.key} className={styles.chip}>
                <Icon name="check" size={20} className={styles.check} />
              </span>
              <span className={styles.label}>{color.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {described && (
        <p id={describedBy} role={error ? 'alert' : undefined} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </p>
      )}
      <div className={styles.preview}>
        <p className={styles.previewLabel}>Así se verá</p>
        <div className={styles.card}>
          <WorkspaceMark name={name || ' '} color={value} size="medium" />
          <span className={styles.cardText}>
            <span className={styles.cardName}>{name || 'Tu espacio'}</span>
            <span className={styles.cardRole}>{role}</span>
          </span>
        </div>
        <p className={styles.previewColor}>Color: {workspaceColorLabel(value)}</p>
      </div>
    </div>
  )
}
