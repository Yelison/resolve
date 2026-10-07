/** Geometría del anillo: sectores con la misma separación a lo largo de todo el borde y esquinas redondeadas. */

export interface SectorInput {
  /** Radio exterior en px. */
  outer: number
  /** Radio interior en px. */
  inner: number
  /** Ángulo inicial en radianes, medido desde las 12 en sentido horario. */
  start: number
  /** Ángulo final en radianes, medido desde las 12 en sentido horario. */
  end: number
  /** Separación entre sectores vecinos en px (la mitad a cada lado del borde). */
  gap: number
  /** Radio de las esquinas en px; se reduce si el sector es demasiado estrecho para él. */
  corner: number
}

type Point = readonly [number, number]

const round = (n: number) => Math.round(n * 100) / 100
const format = ([x, y]: Point) => `${round(x)} ${round(y)}`

/** Punto en el sistema local del borde `angle`: `x` a lo largo del radio y `y` perpendicular, hacia el lado horario. */
function local(centre: number, angle: number, x: number, y: number): Point {
  return [centre + x * Math.sin(angle) + y * Math.cos(angle), centre - x * Math.cos(angle) + y * Math.sin(angle)]
}

/** Tramo de arco que ocupa un sector en el radio dado, una vez descontada la mitad de la separación de cada lado. */
const usableLength = ({ start, end, gap }: SectorInput, radius: number) => (end - start) * radius - gap

/**
 * Trazado (`d`) de un sector de anillo centrado en `(size / 2, size / 2)`. Los bordes son paralelos al radio del límite
 * y quedan `gap / 2` dentro del sector, de modo que dos sectores vecinos se separan exactamente `gap` px en todo el
 * ancho del anillo. Un sector de vuelta completa se dibuja como un anillo sin separación ni esquinas.
 */
export function sectorPath(size: number, input: SectorInput): string {
  const centre = size / 2
  const { outer, inner, start, end, gap } = input
  if (end - start >= Math.PI * 2 - 1e-6) {
    const circle = (radius: number) =>
      `M ${round(centre + radius)} ${centre} A ${radius} ${radius} 0 1 1 ${round(centre - radius)} ${centre} A ${radius} ${radius} 0 1 1 ${round(centre + radius)} ${centre} Z`
    return `${circle(outer)} ${circle(inner)}`
  }
  const half = gap / 2
  const thickness = outer - inner
  const limit = Math.min(usableLength(input, outer), usableLength(input, inner)) / 2
  const corner = Math.max(0, Math.min(input.corner, thickness / 2 - 0.01, limit - 0.01))
  const centreY = half + corner
  const reach = (radius: number, sign: 1 | -1) => (sign === 1 ? radius - corner : radius + corner)
  const along = (radius: number, sign: 1 | -1) => Math.sqrt(Math.max(0, reach(radius, sign) ** 2 - centreY ** 2))

  const outerAlong = along(outer, 1)
  const innerAlong = along(inner, -1)
  const tangent = (angle: number, radius: number, sign: 1 | -1, side: 1 | -1): Point => {
    const scale = radius / reach(radius, sign)
    return local(centre, angle, along(radius, sign) * scale, side * centreY * scale)
  }
  const edge = (angle: number, radiusAlong: number, side: 1 | -1) => local(centre, angle, radiusAlong, side * half)

  const startOuterEdge = edge(start, outerAlong, 1)
  const startOuterArc = tangent(start, outer, 1, 1)
  const endOuterArc = tangent(end, outer, 1, -1)
  const endOuterEdge = edge(end, outerAlong, -1)
  const endInnerEdge = edge(end, innerAlong, -1)
  const endInnerArc = tangent(end, inner, -1, -1)
  const startInnerArc = tangent(start, inner, -1, 1)
  const startInnerEdge = edge(start, innerAlong, 1)

  // Cada arco va de un punto tangente al otro: el ángulo del sector menos lo que se adelanta el tangente en cada extremo.
  const large = end - start - 2 * Math.atan2(centreY, outerAlong) > Math.PI ? 1 : 0
  const largeInner = end - start - 2 * Math.atan2(centreY, innerAlong) > Math.PI ? 1 : 0
  const corners = corner > 0
  const arc = (radius: number, large: 0 | 1, sweep: 0 | 1, to: Point) =>
    `A ${round(radius)} ${round(radius)} 0 ${large} ${sweep} ${format(to)}`
  const turn = (to: Point) => (corners ? arc(corner, 0, 1, to) : `L ${format(to)}`)

  return [
    `M ${format(startOuterEdge)}`,
    turn(startOuterArc),
    arc(outer, large, 1, endOuterArc),
    turn(endOuterEdge),
    `L ${format(endInnerEdge)}`,
    turn(endInnerArc),
    arc(inner, largeInner, 0, startInnerArc),
    turn(startInnerEdge),
    'Z',
  ].join(' ')
}

export interface DonutSlice {
  /** Valor del segmento (≥ 0). */
  value: number
  /** Ángulo inicial en radianes. */
  start: number
  /** Ángulo final en radianes. */
  end: number
}

/**
 * Reparte la vuelta entre los valores. Un segmento con valor nunca baja de `minAngle` (para que se vea y se pueda
 * señalar); lo que ocupa de más se descuenta de los demás en proporción a su tamaño. Los valores 0 no ocupan ángulo.
 */
export function sliceAngles(values: number[], minAngle: number): DonutSlice[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  const full = Math.PI * 2
  if (total <= 0) return values.map((value) => ({ value, start: 0, end: 0 }))
  const shares = values.map((value) => (Math.max(0, value) / total) * full)
  const floor = Math.min(minAngle, full / Math.max(1, values.filter((value) => value > 0).length))
  const small = shares.map((share) => share > 0 && share < floor)
  const missing = shares.reduce((sum, share, index) => sum + (small[index] ? floor - share : 0), 0)
  const spare = shares.reduce((sum, share, index) => sum + (!small[index] && share > 0 ? share - floor : 0), 0)
  const angles = shares.map((share, index) => {
    if (small[index]) return floor
    if (share <= 0 || spare <= 0) return share
    return share - ((share - floor) / spare) * missing
  })
  let cursor = 0
  return values.map((value, index) => {
    const start = cursor
    cursor += angles[index] ?? 0
    return { value, start, end: cursor }
  })
}
