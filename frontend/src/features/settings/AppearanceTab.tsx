import { AppearanceForm } from './AppearanceForm'
import { SettingsSection } from './SettingsSection'

/** Pestaña «Apariencia»: disponible para todos los roles. */
export function AppearanceTab() {
  return (
    <SettingsSection title="Apariencia" description="Elige cómo se ve la interfaz.">
      <AppearanceForm />
    </SettingsSection>
  )
}
