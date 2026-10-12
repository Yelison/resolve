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

	/**
	 * Atributo de la petición con la {@link VerifiedIdentity} de quien el proveedor autenticó y no tiene ninguna
	 * membresía; va siempre junto a {@link #NO_MEMBERSHIP_ATTRIBUTE}. No es un principal: el contexto de seguridad sigue
	 * vacío y solo la regla de {@code POST /organizations} (con el modo {@code open}) y el {@code 401} lo leen.
	 */
	String IDENTITY_ATTRIBUTE = PrincipalResolver.class.getName() + ".IDENTITY";

	Optional<CurrentMember> resolve(HttpServletRequest request);

}
