/**
 * Lleva el foco al `h1` de la página si, tras cerrar un diálogo, se perdió: el disparador ya no existe (p. ej. un 403
 * ocultó las acciones o la fila se retiró) y el navegador lo dejó en `body`. Si el foco está en otro elemento, no toca nada.
 * Va diferido porque el diálogo devuelve el foco a su disparador al desmontarse, después del cierre.
 */
export function focusPageHeadingIfFocusLost() {
  window.setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body) return
    const heading = document.querySelector('h1')
    if (!heading) return
    // El título no es interactivo: se vuelve enfocable solo por programa.
    heading.tabIndex = -1
    heading.focus()
  }, 0)
}
