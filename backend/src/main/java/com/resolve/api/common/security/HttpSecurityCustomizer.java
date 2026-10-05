package com.resolve.api.common.security;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

/**
 * Ajuste que un perfil aplica a la cadena de seguridad compartida. La cadena nace sin sesión, sin CSRF y sin
 * inicio de sesión; el perfil {@code oidc} lo activa con una implementación de esta interfaz, de modo que las reglas
 * de autorización por rol sean una sola para todos los perfiles.
 */
interface HttpSecurityCustomizer {

	void customize(HttpSecurity http) throws Exception;

}
