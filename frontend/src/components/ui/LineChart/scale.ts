export interface Scale {
  /** Valor del extremo inferior del eje vertical (siempre ≤ 0 si hay valores negativos, y 0 si no). */
  min: number
  /** Valor del extremo superior del eje vertical. */
  max: number
  /** Valores de las marcas del eje, de menor a mayor, con 0 entre ellas cuando está en el rango. */
  ticks: number[]
}

/** Salto «redondo» (1, 2, 5 × 10ⁿ) que da como mucho `target` marcas para el rango. */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * power
}

/**
 * Eje vertical de un gráfico de líneas: siempre incluye el 0 (una serie que parte de cero no debe parecer que parte de
 * otro valor), y redondea los extremos a un múltiplo del salto para que las marcas caigan en cifras redondas.
 */
export function niceScale(values: number[], targetTicks = 4): Scale {
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  if (high === low) return { min: 0, max: 1, ticks: [0, 1] }
  const step = niceStep(high - low, targetTicks)
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value / step) * step)
  return { min, max, ticks }
}
