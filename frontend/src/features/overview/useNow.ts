import { useEffect, useState } from 'react'

/** La hora actual, renovada cada minuto: el saludo y los «hace 5 min» cambian solos sin recargar la página. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
