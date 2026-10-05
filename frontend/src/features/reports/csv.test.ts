import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, toCsv } from './csv'

const body = (csv: string) => csv.slice(1)

describe('toCsv', () => {
  it('empieza por el BOM UTF-8 una sola vez y separa las filas con CRLF', () => {
    const csv = toCsv(['A', 'B'], [['x', 1]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.indexOf('﻿', 1)).toBe(-1)
    expect(body(csv)).toBe('A,B\r\nx,1\r\n')
  })

  it('conserva las tildes y la eñe sin escapar', () => {
    expect(body(toCsv(['Agente'], [['Sofía Muñoz']]))).toBe('Agente\r\nSofía Muñoz\r\n')
  })

  it('entrecomilla las comas y duplica las comillas', () => {
    expect(body(toCsv(['n'], [['Pérez, Ana'], ['dijo "hola"']]))).toBe('n\r\n"Pérez, Ana"\r\n"dijo ""hola"""\r\n')
  })

  it('entrecomilla los saltos de línea sin cambiarlos', () => {
    expect(body(toCsv(['n'], [['uno\ndos'], ['uno\r\ndos']]))).toBe('n\r\n"uno\ndos"\r\n"uno\r\ndos"\r\n')
  })

  it('escribe los nulos como celda vacía y los números tal cual', () => {
    expect(body(toCsv(['a', 'b', 'c'], [[null, 0, 12.5]]))).toBe('a,b,c\r\n,0,12.5\r\n')
  })

  it.each(['=SUMA(A1)', '+1', '-1', '@cmd', '\tx', '\rx'])('protege contra fórmulas la celda %j', (cell) => {
    const row = body(toCsv(['n'], [[cell]])).split('\r\n')[1]!
    // Si el texto lleva un retorno de carro, el prefijo queda dentro de las comillas.
    expect(row.replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it.each([' =1+1', '  +cmd', '\u00a0@x', '\u200b=1', '\ufeff-1', '＝1+1', '＋1', '－1', '＠SUMA', ' ＝1'])(
    'protege también la celda con espacios delante o signos de ancho completo %j',
    (cell) => {
      const row = body(toCsv(['n'], [[cell]])).split('\r\n')[1]!
      expect(row.startsWith("'")).toBe(true)
    },
  )

  it.each(['|calc', 'a =1', '1+1', 'Ana =', 'x'])('no prefija la celda inofensiva %j', (cell) => {
    expect(body(toCsv(['n'], [[cell]])).split('\r\n')[1]).toBe(cell)
  })

  it('prefija y luego entrecomilla una fórmula con coma o comillas', () => {
    expect(body(toCsv(['n'], [['=HYPERLINK("http://x","y")']]))).toBe(`n\r\n"'=HYPERLINK(""http://x"",""y"")"\r\n`)
  })

  it('no prefija un número negativo ni un texto que no empieza por un carácter peligroso', () => {
    expect(body(toCsv(['n'], [[-3], ['a=b'], ['1-2']]))).toBe('n\r\n-3\r\na=b\r\n1-2\r\n')
  })

  it('protege también las cabeceras', () => {
    expect(body(toCsv(['=x'], []))).toBe("'=x\r\n")
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('crea un objeto con el CSV, lo descarga con el nombre dado y lo libera', async () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:csv')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('reporte.csv')
      expect(this.href).toBe('blob:csv')
    })

    downloadCsv('reporte.csv', '﻿a\r\n')

    expect(click).toHaveBeenCalledOnce()
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toBe('text/csv;charset=utf-8')
    // `text()` descarta el BOM al decodificar: se comparan los bytes (EF BB BF + «a» + CRLF).
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
  })
})
