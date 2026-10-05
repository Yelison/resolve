import { Radio } from '../../components/ui'
import { useTheme } from '../../app/theme/useTheme'
import type { ThemePreference } from '../../app/theme/theme'
import styles from './forms.module.css'

const options: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Usar el del sistema' },
]

/**
 * Tema de la interfaz. No hay nada que guardar en el servidor: el cambio se aplica al elegirlo y se recuerda solo en
 * este navegador, y el texto lo dice.
 */
export function AppearanceForm() {
  const { preference, setPreference } = useTheme()
  return (
    <>
      <fieldset className={styles.choices}>
        <legend className={styles.legend}>Tema</legend>
        {options.map((option) => (
          <Radio
            key={option.value}
            name="theme"
            className={styles.choice}
            label={option.label}
            checked={preference === option.value}
            onChange={() => setPreference(option.value)}
          />
        ))}
      </fieldset>
      <p className={styles.note}>Esta preferencia se guarda en este navegador.</p>
    </>
  )
}
