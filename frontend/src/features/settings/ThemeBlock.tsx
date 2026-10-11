import { useId, type CSSProperties } from 'react'
import tokens from '@yelison/forma-ui/tokens.json'
import { Radio } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useTheme } from '../../app/theme/useTheme'
import type { ThemePreference } from '../../app/theme/theme'
import { SettingsBlock } from './SettingsBlock'
import styles from './ThemeBlock.module.css'

const options: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Como el sistema' },
]

type Palette = Record<string, string>

/** Los colores de un tema, leídos de los tokens del kit: la miniatura enseña ese tema sea cual sea el activo. */
const paletteStyle = (palette: Palette): CSSProperties =>
  ({
    '--thumb-nav': palette['--color-nav'],
    '--thumb-bg': palette['--color-bg'],
    '--thumb-ink': palette['--color-ink'],
    '--thumb-surface': palette['--color-surface'],
    '--thumb-line': palette['--color-line'],
  }) as CSSProperties

/** Miniatura de un tema: menú, título y panel. «Como el sistema» es la mitad clara y la mitad oscura. */
function Thumbnail({ value }: { value: ThemePreference }) {
  if (value === 'system') {
    return (
      <span className={styles.thumb} aria-hidden="true">
        <span className={styles.half} style={paletteStyle(tokens.light)} />
        <span className={styles.half} style={paletteStyle(tokens.dark)} />
      </span>
    )
  }
  return (
    <span className={cx(styles.thumb, styles.themed)} style={paletteStyle(tokens[value])} aria-hidden="true">
      <span className={styles.nav} />
      <span className={styles.page}>
        <span className={styles.title} />
        <span className={styles.panel} />
      </span>
    </span>
  )
}

/**
 * Tema de la interfaz, con una miniatura por opción. No hay nada que guardar en el servidor: el cambio se aplica al
 * elegirlo y se recuerda en este navegador, así que no usa la barra de guardar. Es el mismo almacén que el botón de
 * la barra superior.
 */
export function ThemeBlock() {
  const { preference, resolved, setPreference } = useTheme()
  const noteId = useId()
  return (
    <SettingsBlock
      stacked
      title="Tema"
      description="Elige cómo se ve Resolve. Se aplica al momento y se guarda en este navegador."
    >
      <div className={styles.box}>
        <fieldset className={styles.choices}>
          <legend className="visually-hidden">Tema</legend>
          {options.map((option) => (
            <div key={option.value} className={styles.card}>
              <Thumbnail value={option.value} />
              <Radio
                name="theme"
                className={styles.choice}
                label={option.label}
                checked={preference === option.value}
                aria-describedby={option.value === 'system' ? noteId : undefined}
                onChange={() => setPreference(option.value)}
              />
              {option.value === 'system' && (
                <span id={noteId} className={styles.note}>
                  Ahora: {resolved === 'dark' ? 'oscuro' : 'claro'}
                </span>
              )}
            </div>
          ))}
        </fieldset>
      </div>
    </SettingsBlock>
  )
}
