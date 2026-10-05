/**
 * Lleva el foco al título de la sección que contiene `from`. Tras guardar, «Guardar cambios» queda deshabilitado (ya
 * no hay cambios) y un botón deshabilitado no conserva el foco: el título, enfocable solo por programa, es un sitio
 * con sentido y el lector de pantalla lee a dónde ha vuelto.
 */
export function focusSectionHeading(from: Element | null) {
  const heading = from?.closest('section')?.querySelector<HTMLElement>('h2')
  if (!heading) return
  heading.tabIndex = -1
  heading.focus()
}
