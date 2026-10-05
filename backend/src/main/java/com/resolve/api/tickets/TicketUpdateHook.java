package com.resolve.api.tickets;

/**
 * Punto de extensión que solo implementan los tests: {@link TicketService#update} lo invoca tras comprobar la
 * versión, con la fila bloqueada, para poder aparcar el PATCH a mitad de la transacción. En producción no hay ningún
 * bean de este tipo y no se ejecuta nada.
 */
interface TicketUpdateHook {

	void afterVersionCheck();

}
