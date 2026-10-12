/**
 * Lleva el foco al primer título de bloque del formulario que contiene `from`. Tras guardar, «Guardar cambios» queda
 * deshabilitado (ya no hay cambios) y un botón deshabilitado no conserva el foco: el título, enfocable solo por
 * programa, es un sitio con sentido y el lector de pantalla lee a dónde ha vuelto.
 */
export function focusSectionHeading(from: Element | null) {
  const root = from?.closest('form') ?? from?.closest('section')
  const heading = root?.querySelector<HTMLElement>('h2')
  if (!heading) return
  heading.tabIndex = -1
  heading.focus()
}

/** Lleva el foco al campo `name` del formulario, p. ej. al primero que se descartó, para que no caiga en `body`. */
export function focusField(form: HTMLFormElement | null, name: string) {
  // En un grupo de radios (el color) el foco va a la opción marcada, que es la que recibe el tabulador.
  const fields = form?.querySelectorAll<HTMLElement>(`[name="${name}"]`)
  const target = [...(fields ?? [])].find((field) => (field as HTMLInputElement).checked) ?? fields?.[0]
  target?.focus()
}
