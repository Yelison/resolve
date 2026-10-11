import { describe, expect, it } from 'vitest'
import { formatToday, greetingFor } from './greeting'

describe('greetingFor', () => {
  // 12:00 UTC es 07:00 en Bogotá, 14:00 en Madrid y 21:00 en Tokio.
  const noonUtc = new Date('2026-10-10T12:00:00Z')

  it('usa la hora de la zona de la organización, no la del navegador', () => {
    expect(greetingFor(noonUtc, 'America/Bogota')).toBe('Buenos días')
    expect(greetingFor(noonUtc, 'Europe/Madrid')).toBe('Buenas tardes')
    expect(greetingFor(noonUtc, 'Asia/Tokyo')).toBe('Buenas noches')
  })

  it.each([
    ['04:59', 'Buenas noches'],
    ['05:00', 'Buenos días'],
    ['11:59', 'Buenos días'],
    ['12:00', 'Buenas tardes'],
    ['19:59', 'Buenas tardes'],
    ['20:00', 'Buenas noches'],
    ['00:00', 'Buenas noches'],
  ])('a las %s dice «%s»', (time, expected) => {
    expect(greetingFor(new Date(`2026-10-10T${time}:00Z`), 'UTC')).toBe(expected)
  })
})

describe('formatToday', () => {
  it('escribe el día de la semana con mayúscula inicial', () => {
    expect(formatToday(new Date('2026-10-10T12:00:00Z'), 'America/Bogota')).toBe('Sábado, 10 de octubre')
  })

  it('el día es el de la zona de la organización, también cerca de medianoche', () => {
    const lateInBogota = new Date('2026-10-11T03:30:00Z') // 22:30 del sábado en Bogotá
    expect(formatToday(lateInBogota, 'America/Bogota')).toBe('Sábado, 10 de octubre')
    expect(formatToday(lateInBogota, 'Europe/Madrid')).toBe('Domingo, 11 de octubre')
  })
})
