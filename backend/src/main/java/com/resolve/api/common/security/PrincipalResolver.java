package com.resolve.api.common.security;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Obtiene el miembro autenticado de una petición. Hay una implementación por perfil: la de demostración (dev y test,
 * nunca con oidc) y la de OpenID Connect (oidc); sin ninguna, toda llamada a la API responde 401.
 */
public interface PrincipalResolver {

	/**
	 * Atributo de la petición que un resolvedor activa cuando la identidad existe pero ya no tiene acceso (membresía
	 * retirada o cliente archivado): el 401 lo dice en su {@code detail}.
	 */
	String DEACTIVATED_ATTRIBUTE = PrincipalResolver.class.getName() + ".DEACTIVATED";

	/**
	 * Atributo de la petición que un resolvedor activa cuando el proveedor autenticó a la persona pero no tiene ninguna
	 * membresía: el 401 lo distingue del de quien no ha iniciado sesión.
	 */
	String NO_MEMBERSHIP_ATTRIBUTE = PrincipalResolver.class.getName() + ".NO_MEMBERSHIP";

	Optional<CurrentMember> resolve(HttpServletRequest request);

}
