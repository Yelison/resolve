export type CsvCell = string | number | null

const BOM = '﻿'
const ROW_SEPARATOR = '\r\n'
/** Celdas que una hoja de cálculo interpretaría como fórmula si empezaran así. */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Una celda de texto: se neutraliza la inyección de fórmulas con un `'` delante y después se entrecomilla si hace
 * falta (RFC 4180). El orden importa: el prefijo va primero para que un `\r` inicial acabe prefijado *y* entrecomillado.
 * Los números y los nulos (celda vacía) no pasan por la protección: no son texto del usuario.
 */
function escapeCell(cell: CsvCell): string {
  if (cell === null) return ''
  if (typeof cell === 'number') return String(cell)
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV de RFC 4180 (filas con CRLF, comillas duplicadas) con BOM UTF-8 para que Excel respete las tildes. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join(ROW_SEPARATOR) + ROW_SEPARATOR
}

/** Descarga `content` como archivo en el navegador, sin pasar por el servidor. */
export function downloadCsv(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // El navegador ya tiene la descarga en marcha; se libera el objeto en cuanto termina el turno actual.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
