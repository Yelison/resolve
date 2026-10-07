import { useLayoutEffect, useState } from 'react'

/**
 * Ancho del elemento observado, o `null` hasta que se mide (o si el entorno no tiene ResizeObserver).
 * Usa un callback ref con estado: el elemento puede montarse después (p. ej. al llegar los datos).
 */
export function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => setWidth(element.getBoundingClientRect().width || null)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [setElement, width] as const
}
