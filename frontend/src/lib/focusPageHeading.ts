function focusHeading() {
  const heading = document.querySelector('h1')
  if (!heading) return
  // El título no es interactivo: se vuelve enfocable solo por programa.
  heading.tabIndex = -1
  heading.focus()
}

/**
 * Lleva el foco al `h1` de la página, sin condición. Para cuando se sabe que el disparador va a desaparecer (p. ej. la
 * fila del miembro retirado sale del filtro activo). Debe llamarse desde un efecto del componente que cierra el
 * diálogo: los cleanups de los efectos del diálogo (que le devuelven el foco al disparador) corren antes que los
 * efectos del padre en el mismo commit, así que el título se queda con el foco aunque la lista cambie después.
 */
export function focusPageHeading() {
  focusHeading()
}

/**
 * Lleva el foco al `h1` si, tras cerrar un diálogo, ya no hay ningún elemento enfocado: el disparador no existe (p. ej.
 * un 403 ocultó las acciones) y el navegador dejó el foco en `body`. Si el foco está en otro elemento, no toca nada.
 * Solo cubre el disparador que ya no existe en el momento del cierre; si desaparece después, usa `focusPageHeading` desde un efecto.
 */
export function focusPageHeadingIfFocusLost() {
  window.setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body) return
    focusHeading()
  }, 0)
}
