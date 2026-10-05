package com.resolve.api.memberships;

/**
 * Punto de extensión que solo implementan los tests: {@link MemberService} lo invoca tras comprobar la regla del
 * último administrador y antes de aplicar el cambio, con el bloqueo del equipo tomado, para poder aparcar la
 * operación a mitad de la transacción. En producción no hay ningún bean de este tipo y no se ejecuta nada.
 */
interface MemberGuardHook {

	void afterGuardCheck();

}
