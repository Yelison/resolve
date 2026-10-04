import { useCallback, useState } from 'react'

const STORAGE_KEY = 'resolve-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Preferencia de colapsar el menú lateral en escritorio; se recuerda entre visitas. */
export function useSidebarPreference() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Sin almacenamiento la preferencia dura solo esta sesión.
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
