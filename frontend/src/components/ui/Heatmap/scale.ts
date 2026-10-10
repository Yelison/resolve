/** Pasos de la escala: 0 es una celda sin valor y 1…4 van de menos a más intensa (4 = el tramo más alto). */
export type HeatStep = 0 | 1 | 2 | 3 | 4

/**
 * Paso discreto de un valor frente al máximo del mapa. El valor se codifica con cuatro pasos distintos de la rampa y no
 * con la opacidad, para que se lea igual en el tema claro y en el oscuro. Cualquier valor positivo, por pequeño que sea,
 * es al menos el paso 1: una celda con datos nunca se confunde con una vacía.
 */
export function heatStep(value: number, max: number): HeatStep {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatStep
}
