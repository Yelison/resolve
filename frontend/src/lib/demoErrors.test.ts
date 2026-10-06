import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { isDemoMaintenanceActive as isMaintenanceNow, setDemoMaintenance } from './demoMaintenance'
import {
  DEMO_MAINTENANCE_MESSAGE,
  demoErrorMessage,
  isDemoLimit,
  isDemoMaintenance,
  isLockTimeout,
  isTooManyWrites,
  mutationErrorDetail,
  TOO_MANY_WRITES_MESSAGE,
} from './mutationError'
import { queryClient } from './queryClient'

const maintenance = new ApiError(503, { status: 503, title: 'Reinicio de la demostración en curso' })
const lock = new ApiError(503, { status: 503, title: 'Recurso ocupado' })
const tooMany = new ApiError(429, { status: 429, title: 'Demasiadas escrituras' })
const limit = new ApiError(409, {
  status: 409,
  title: 'Límite de la demostración',
  detail: 'La demostración admite hasta 500 tickets por organización.',
})
const stateConflict = new ApiError(409, { status: 409, title: 'Conflicto', detail: 'El cliente ya está archivado.' })

describe('errores de la demostración pública', () => {
  afterEach(() => {
    setDemoMaintenance(false)
  })

  it('distingue el 503 del reinicio del de «Recurso ocupado»', () => {
    expect(isDemoMaintenance(maintenance)).toBe(true)
    expect(isLockTimeout(maintenance)).toBe(false)
    expect(isDemoMaintenance(lock)).toBe(false)
    expect(isDemoMaintenance(new ApiError(503, { status: 503, title: 'Service Unavailable' }))).toBe(false)
  })

  it('reconoce el 429 y el 409 del tope, y no confunde otro 409', () => {
    expect(isTooManyWrites(tooMany)).toBe(true)
    expect(isDemoLimit(limit)).toBe(true)
    expect(isDemoLimit(stateConflict)).toBe(false)
    expect(demoErrorMessage(stateConflict)).toBeUndefined()
    expect(demoErrorMessage(lock)).toBeUndefined()
  })

  it('da a cada rechazo su texto: el tope usa el detail y nada más', () => {
    expect(mutationErrorDetail(maintenance)).toBe(DEMO_MAINTENANCE_MESSAGE)
    expect(mutationErrorDetail(tooMany)).toBe(TOO_MANY_WRITES_MESSAGE)
    expect(mutationErrorDetail(limit)).toBe('La demostración admite hasta 500 tickets por organización.')
    expect(mutationErrorDetail(stateConflict)).toBe('El cliente ya está archivado.')
  })

  it('el cliente de consultas marca el reinicio en toda la aplicación y lo retira con la primera respuesta correcta', async () => {
    const seen: boolean[] = []
    const failing = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(maintenance),
    })
    await failing.execute(undefined).catch(() => undefined)
    seen.push(isMaintenanceNow())
    const working = queryClient.getMutationCache().build(queryClient, { mutationFn: () => Promise.resolve('ok') })
    await working.execute(undefined)
    seen.push(isMaintenanceNow())
    expect(seen).toEqual([true, false])
  })

  it('un 503 de bloqueo o un 429 no marcan el reinicio', async () => {
    for (const error of [lock, tooMany]) {
      const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: () => Promise.reject(error) })
      await mutation.execute(undefined).catch(() => undefined)
    }
    expect(isMaintenanceNow()).toBe(false)
  })
})
