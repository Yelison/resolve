import { useEffect, useState } from 'react'

/**
 * Alto que el aviso pegado al borde inferior (demostración pública) tapa de la ventana. El aviso lo publica en el
 * `scroll-padding-bottom` del documento; leerlo aquí evita que la bandeja, que mide el alto de la ventana, termine
 * detrás de él.
 */
export function useBottomReserve(): number {
  const [reserve, setReserve] = useState(0)
  useEffect(() => {
    const root = document.documentElement
    const read = () => setReserve(Number.parseFloat(root.style.scrollPaddingBottom) || 0)
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])
  return reserve
}
