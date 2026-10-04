package com.resolve.api.common.security;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Obtiene el miembro autenticado de una petición. Hoy solo existe la implementación de demostración
 * (perfiles dev y test); sin ninguna, toda llamada a la API responde 401.
 */
public interface PrincipalResolver {

	Optional<CurrentMember> resolve(HttpServletRequest request);

}
