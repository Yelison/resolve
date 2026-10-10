import type { FormaStrings } from '@yelison/forma-ui'

/**
 * Los textos que los componentes de `@yelison/forma-ui` muestran por su cuenta, en español. El paquete los trae en inglés
 * (ADR 0002): sin esto, `Button loading` se anunciaría «Loading…».
 *
 * `satisfies Record<keyof FormaStrings, string>` hace fallar `tsc` si una versión del paquete añade una clave sin su
 * valor aquí; `formaStrings.test.ts` lo comprueba también en ejecución, y fija cada texto.
 */
export const formaStrings = {
  buttonLoading: 'Enviando…',
  dialogClose: 'Cerrar',
} satisfies Record<keyof FormaStrings, string>
