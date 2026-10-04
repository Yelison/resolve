let locks = 0

/** Bloquea el scroll del documento mientras haya al menos un overlay modal abierto. */
export function lockScroll(): () => void {
  const root = document.documentElement
  if (locks === 0) {
    // Compensa la barra de scroll que desaparece para que el contenido no salte.
    const scrollbar = window.innerWidth - root.clientWidth
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
  }
  locks += 1
  root.classList.add('scroll-locked')
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0) {
      root.classList.remove('scroll-locked')
      root.style.removeProperty('padding-right')
    }
  }
}
