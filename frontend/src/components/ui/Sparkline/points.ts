const round = (n: number) => Math.round(n * 100) / 100

export interface SparklinePoint {
  x: number
  y: number
}

/**
 * Posiciones de los valores dentro de un área de `width × height` px con `pad` px de margen. Con todos los valores
 * iguales (o con uno solo) la línea va a media altura: no hay escala que dividir.
 */
export function sparklinePoints(values: number[], width: number, height: number, pad: number): SparklinePoint[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const usableWidth = width - pad * 2
  const usableHeight = height - pad * 2
  return values.map((value, index) => ({
    x: round(values.length === 1 ? width / 2 : pad + (index * usableWidth) / (values.length - 1)),
    y: round(span === 0 ? height / 2 : pad + (1 - (value - min) / span) * usableHeight),
  }))
}
