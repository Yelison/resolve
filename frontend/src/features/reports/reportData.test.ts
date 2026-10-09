import { describe, expect, it } from 'vitest'
import type { ReportAgent, ReportDay } from '../../api/schema'
import {
  agentResponses,
  agentsCsv,
  agentStatusLabel,
  channelColors,
  channelSegments,
  channelValueText,
  chartData,
  compareCount,
  cumulativePending,
  csvFileName,
  formatHours,
  formatMinutes,
  formatRange,
  hasActivity,
  missingResponsesNote,
  pendingPoints,
  pendingText,
  resolvedShare,
  signedInteger,
} from './reportData'

describe('compareCount', () => {
  it('da la diferencia absoluta, el porcentaje y rotula el periodo anterior por su duración', () => {
    expect(compareCount(361, 300, 7)).toEqual({
      text: '61 más (20 %) frente a los 7 días anteriores',
      arrow: '↑',
      trend: 'neutral',
    })
    expect(compareCount(150, 200, 30).text).toBe('50 menos (25 %) frente a los 30 días anteriores')
  })

  it('agrupa los miles como el resto de la página', () => {
    expect(compareCount(13000, 1000, 90).text).toBe('12.000 más (1200 %) frente a los 90 días anteriores')
    expect(channelValueText({ channel: 'email', created: 12000, share: 80 })).toBe('80 % · 12.000 tickets')
  })

  it('no inventa un porcentaje si el periodo anterior fue 0', () => {
    const comparison = compareCount(12, 0, 90)
    expect(comparison.text).toBe('12 más frente a los 90 días anteriores')
    expect(comparison.text).not.toContain('%')
    expect(comparison.text).not.toContain('Infinity')
  })

  it('no escribe 0 % cuando el cambio redondea a cero', () => {
    expect(compareCount(1001, 1000, 7).text).toBe('1 más frente a los 7 días anteriores')
  })

  it('dice que no hay cambios, sin flecha, cuando son iguales (también con 0 y 0)', () => {
    expect(compareCount(5, 5, 7)).toEqual({
      text: 'Sin cambios frente a los 7 días anteriores',
      arrow: null,
      trend: 'neutral',
    })
    expect(compareCount(0, 0, 7).arrow).toBeNull()
  })

  it('nunca llama al periodo anterior «semana pasada» ni «mes pasado»', () => {
    expect(compareCount(2, 1, 30).text).not.toMatch(/semana pasada|mes pasado/)
  })
})

describe('resolvedShare', () => {
  it('es un cociente por cada 100 creados y puede pasar de 100 sin sugerir un subconjunto', () => {
    expect(resolvedShare(300, 361)).toBe('83 resueltos por cada 100 creados')
    expect(resolvedShare(30, 20)).toBe('150 resueltos por cada 100 creados')
  })

  it('no hay porcentaje si no se creó ningún ticket', () => {
    expect(resolvedShare(4, 0)).toBeNull()
  })
})

describe('formatos de medianas', () => {
  it('muestran «Sin datos» para null', () => {
    expect(formatMinutes(null)).toBe('Sin datos')
    expect(formatHours(null)).toBe('Sin datos')
    expect(formatMinutes(18)).toBe('18 min')
    expect(formatHours(6.5)).toBe('6,5 h')
    expect(formatMinutes(12000)).toBe('12.000 min')
  })

  it('el valor de un canal lleva porcentaje y recuento', () => {
    expect(channelValueText({ channel: 'email', created: 30, share: 71.4 })).toBe('71,4 % · 30 tickets')
    expect(channelValueText({ channel: 'web', created: 1, share: 100 })).toBe('100 % · 1 ticket')
  })
})

const day = (index: number, created = index, resolved = 0): ReportDay => ({
  date: new Date(Date.UTC(2026, 6, 6 + index)).toISOString().slice(0, 10),
  created,
  resolved,
})
const days = (count: number) => Array.from({ length: count }, (_, index) => day(index))

describe('chartData', () => {
  it('7 días: un punto por día con el día de la semana en tres letras, sin desplazarlo por la zona del navegador', () => {
    const { points, granularity } = chartData([day(0, 3, 2), day(1)])
    expect(granularity).toBe('day')
    expect(points[0]).toMatchObject({ key: '2026-07-06', shortLabel: 'lun', values: { created: 3, resolved: 2 } })
    expect(points[1]?.shortLabel).toBe('mar')
  })

  it('7 días: el miércoles es «mié», no «X»', () => {
    const { points } = chartData(days(7))
    expect(points.map((point) => point.shortLabel)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  })

  it('30 días: un punto por día con el número del día en el eje', () => {
    const { points, granularity } = chartData(days(30))
    expect(granularity).toBe('day')
    expect(points).toHaveLength(30)
    expect(points[0]?.shortLabel).toBe('6')
  })

  it('90 días: agrega por semanas desde el primer día y rotula la última, parcial, con su rango', () => {
    const { points, granularity } = chartData(days(90))
    expect(granularity).toBe('week')
    expect(points).toHaveLength(13)
    expect(points[0]?.values.created).toBe(0 + 1 + 2 + 3 + 4 + 5 + 6)
    // 90 = 12 semanas + 6 días: la última semana tiene seis días y no se pierde ninguno.
    expect(points.reduce((sum, point) => sum + (point.values.created ?? 0), 0)).toBe((89 * 90) / 2)
    expect(points[12]?.label).toMatch(/–/)
    expect(points[0]?.label).toMatch(/–/)
  })

  it('suma también los resueltos de cada semana', () => {
    const { points } = chartData(Array.from({ length: 90 }, (_, index) => day(index, 0, 1)))
    expect(points[0]?.values.resolved).toBe(7)
    expect(points[12]?.values.resolved).toBe(6)
  })

  it('sin días no hay puntos', () => {
    expect(chartData([]).points).toEqual([])
  })
})

describe('hasActivity', () => {
  it('es falso si todos los días están a cero', () => {
    expect(hasActivity([day(0, 0, 0), day(1, 0, 0)])).toBe(false)
    expect(hasActivity([day(0, 0, 0), day(1, 0, 2)])).toBe(true)
  })
})

describe('formatRange y csvFileName', () => {
  it('formatea el rango en la zona indicada, no en la del navegador', () => {
    const period = { from: '2026-09-28T05:00:00Z', to: '2026-10-05T03:30:00Z' }
    expect(formatRange(period, 'America/Bogota')).toMatch(/^28 sept?\.? 2026 – 4 oct\.? 2026$/)
    expect(formatRange(period, 'UTC')).toMatch(/^28 sept?\.? 2026 – 5 oct\.? 2026$/)
  })

  it('el nombre del archivo usa el día de «to» en la zona de la organización', () => {
    // 03:30 UTC del día 5 sigue siendo el día 4 en Bogotá (UTC-5).
    expect(csvFileName('30d', '2026-10-05T03:30:00Z', 'America/Bogota')).toBe('reporte-agentes-30d-2026-10-04.csv')
    expect(csvFileName('7d', '2026-10-05T03:30:00Z', 'UTC')).toBe('reporte-agentes-7d-2026-10-05.csv')
  })
})

const agent = (overrides: Partial<ReportAgent> = {}): ReportAgent => ({
  member: { id: 'u-1', name: 'Laura Méndez' },
  status: 'active',
  resolved: 20,
  firstResponseMinutes: 15,
  openAssigned: 4,
  ...overrides,
})

describe('agentsCsv', () => {
  it('lleva el estado de cada persona y deja vacía la mediana sin datos', () => {
    const csv = agentsCsv([
      agent(),
      agent({ member: { id: 'u-2', name: 'Pablo Viejo' }, status: 'removed', firstResponseMinutes: null }),
      agent({ member: { id: 'u-3', name: 'Sofía Ríos' }, status: 'invited' }),
    ])
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Agente,Estado,Resueltos,Primera respuesta (min),Asignados abiertos',
      'Laura Méndez,Activo,20,15,4',
      'Pablo Viejo,Retirado,20,,4',
      'Sofía Ríos,Invitación pendiente,20,15,4',
      '',
    ])
  })

  it('neutraliza un nombre que empieza como una fórmula', () => {
    expect(agentsCsv([agent({ member: { id: 'u-1', name: '=cmd|calc' } })])).toContain("\r\n'=cmd|calc,Activo")
  })
})

describe('agentStatusLabel', () => {
  it('rotula a quien no es activo y no marca a los activos', () => {
    expect(agentStatusLabel(agent())).toBeNull()
    expect(agentStatusLabel(agent({ status: 'removed' }))).toBe('Retirado')
    expect(agentStatusLabel(agent({ status: 'invited' }))).toBe('Invitación pendiente')
  })
})

const dated = (date: string, created: number, resolved: number): ReportDay => ({ date, created, resolved })

describe('cumulativePending', () => {
  it('acumula día a día las solicitudes menos los resueltos', () => {
    expect(
      cumulativePending([dated('2026-09-28', 10, 4), dated('2026-09-29', 5, 8), dated('2026-09-30', 7, 0)]),
    ).toEqual([6, 3, 10])
  })

  it('puede bajar de 0 cuando se resuelve más de lo que llega', () => {
    expect(cumulativePending([dated('2026-09-28', 1, 5), dated('2026-09-29', 0, 2)])).toEqual([-4, -6])
  })

  it('sin días no hay nada que acumular y con días sin actividad todo es 0', () => {
    expect(cumulativePending([])).toEqual([])
    expect(cumulativePending([dated('2026-09-28', 0, 0), dated('2026-09-29', 0, 0)])).toEqual([0, 0])
  })
})

describe('pendingPoints', () => {
  it('lleva un punto por día con su nombre completo, el valor acumulado y la etiqueta corta del eje', () => {
    const points = pendingPoints([dated('2026-09-28', 10, 4), dated('2026-09-29', 5, 8)])
    expect(points.map((point) => point.value)).toEqual([6, 3])
    expect(points[0]!.key).toBe('2026-09-28')
    expect(points[0]!.label).toMatch(/lunes/)
    expect(points[0]!.shortLabel).toMatch(/^lun/)
  })

  it('con más de 30 días abrevia con el día y el mes', () => {
    const days = Array.from({ length: 31 }, (_, index) => dated(`2026-09-${String(index + 1).padStart(2, '0')}`, 1, 0))
    expect(pendingPoints(days)[0]!.shortLabel).toMatch(/1 sept/)
  })
})

describe('pendingText', () => {
  it('escribe el signo, usa el menos tipográfico y concuerda el singular', () => {
    expect(pendingText(10)).toBe('+10 pendientes')
    expect(pendingText(1)).toBe('+1 pendiente')
    expect(pendingText(0)).toBe('0 pendientes')
    expect(pendingText(-1)).toBe('−1 pendiente')
    expect(pendingText(-12)).toBe('−12 pendientes')
    expect(signedInteger(-3)).toBe('−3')
  })
})

describe('channelSegments', () => {
  it('da a cada canal su color fijo aunque cambie su puesto por volumen', () => {
    const { segments } = channelSegments([
      { channel: 'web', created: 80, share: 80 },
      { channel: 'email', created: 20, share: 20 },
    ])
    expect(segments.map((segment) => [segment.id, segment.color])).toEqual([
      ['web', channelColors.web],
      ['email', channelColors.email],
    ])
    expect(channelColors).toEqual({ email: 1, chat: 2, phone: 3, web: 4 })
  })

  it('lleva en cada segmento el texto «45,5 % · 56 tickets», el nombre del canal y el total', () => {
    const { segments, total } = channelSegments([
      { channel: 'email', created: 56, share: 45.5 },
      { channel: 'chat', created: 67, share: 54.5 },
    ])
    expect(segments[0]).toMatchObject({ label: 'Correo', value: 56, valueText: '45,5 % · 56 tickets' })
    expect(total).toBe(123)
  })

  it('sin canales no hay segmentos ni total', () => {
    expect(channelSegments([])).toEqual({ segments: [], total: 0 })
  })
})

describe('agentResponses', () => {
  it('deja fuera del gráfico a quien no tiene primera respuesta y lo nombra aparte, sin convertirlo en 0', () => {
    const { rows, missing } = agentResponses([
      agent({ member: { id: 'a', name: 'Ana' }, firstResponseMinutes: 12 }),
      agent({ member: { id: 'b', name: 'Beto' }, firstResponseMinutes: null }),
      agent({ member: { id: 'c', name: 'Cata' }, firstResponseMinutes: 0 }),
    ])
    expect(rows).toEqual([
      { key: 'a', label: 'Ana', value: 12 },
      { key: 'c', label: 'Cata', value: 0 },
    ])
    expect(missing).toEqual(['Beto'])
  })

  it('si nadie tiene primera respuesta no hay filas', () => {
    expect(agentResponses([agent({ firstResponseMinutes: null })]).rows).toEqual([])
  })
})

describe('missingResponsesNote', () => {
  it('une los nombres como una lista en español', () => {
    expect(missingResponsesNote(['Pablo Viejo'])).toBe('Sin primeras respuestas en el periodo: Pablo Viejo.')
    expect(missingResponsesNote(['Ana', 'Luis', 'Marta'])).toBe(
      'Sin primeras respuestas en el periodo: Ana, Luis y Marta.',
    )
  })
})
