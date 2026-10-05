package com.resolve.api.common.security;

import com.resolve.api.common.web.ApiPathPrefix;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Autorización por rol a nivel de URL, antes de cualquier lectura o validación: así un cliente recibe 403
 * en una escritura sea cual sea el cuerpo o el número de ticket.
 *
 * <p>
 * La cadena base no tiene sesión ni CSRF (la demostración se autentica con una cabecera en cada petición); el perfil
 * {@code oidc} las activa con un {@link HttpSecurityCustomizer} sobre las mismas reglas.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

	private static final String[] STAFF = { "ADMIN", "AGENT" };

	/**
	 * Las reglas se escriben sin prefijo y aquí reciben el de la API, el mismo que {@link ApiPathPrefix} da a los
	 * controladores.
	 */
	private static String[] api(String... paths) {
		String[] prefixed = new String[paths.length];
		for (int i = 0; i < paths.length; i++) {
			prefixed[i] = ApiPathPrefix.of(paths[i]);
		}
		return prefixed;
	}

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http, ObjectProvider<PrincipalResolver> resolver,
			ObjectProvider<HttpSecurityCustomizer> customizers, JsonMapper jsonMapper) throws Exception {
		ProblemResponses problems = new ProblemResponses(jsonMapper);
		http.csrf(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable)
			.formLogin(AbstractHttpConfigurer::disable)
			.logout(AbstractHttpConfigurer::disable)
			.requestCache(AbstractHttpConfigurer::disable)
			.anonymous(AbstractHttpConfigurer::disable)
			.sessionManagement((session) -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.exceptionHandling((exceptions) -> exceptions.authenticationEntryPoint(problems::unauthorized)
				.accessDeniedHandler(problems::forbidden))
			.authorizeHttpRequests((requests) -> requests.dispatcherTypeMatchers(DispatcherType.ERROR)
				.permitAll()
				.requestMatchers(api("/actuator/health", "/actuator/health/**"))
				.permitAll()
				// Los ajustes de la organización los lee el personal (regla de lectura de más abajo) y solo los edita un
				// administrador.
				.requestMatchers(HttpMethod.PATCH, api("/organization"))
				.hasRole("ADMIN")
				// Archivar, restaurar e invitar clientes es solo de administradores (Q-02); va antes de la regla general.
				.requestMatchers(HttpMethod.POST,
						api("/customers/{id}/archive", "/customers/{id}/restore", "/customers/{id}/invite"))
				.hasRole("ADMIN")
				// Invitar, cambiar el rol y retirar miembros es solo de administradores; el equipo lo lee el personal.
				.requestMatchers(HttpMethod.POST, api("/members", "/members/{userId}/role", "/members/{userId}/remove"))
				.hasRole("ADMIN")
				// Solo los administradores crean categorías de la base de conocimiento (Q-03); crear y editar artículos
				// es del personal y lo cubre la regla de /api/**.
				.requestMatchers(HttpMethod.POST, api("/knowledge/categories"))
				.hasRole("ADMIN")
				// Los clientes leen la base de conocimiento: el servicio les limita los artículos a los publicados y
				// públicos y responde 404 al resto.
				.requestMatchers(HttpMethod.GET,
						api("/knowledge/categories", "/knowledge/articles", "/knowledge/articles/{slug}"))
				.authenticated()
				// Los informes y el feed de actividad son del personal. «/tickets/activity» tiene que estar en esta regla,
				// que va antes de «/tickets/{number}»: ese patrón también la reconoce y dejaría pasar a un cliente.
				.requestMatchers(HttpMethod.GET,
						api("/tickets/metrics", "/tickets/activity", "/tickets/{number}/activity", "/customers",
								"/customers/**", "/assignees", "/members", "/members/metrics", "/reports/summary",
								"/organization"))
				.hasAnyRole(STAFF)
				// Cada persona edita su propio nombre, sea cual sea su rol; sin esta regla la de /api/** lo limitaría al
				// personal.
				.requestMatchers(HttpMethod.PATCH, api("/me"))
				.authenticated()
				// Cada persona lista y elige sus organizaciones, sea cual sea su rol: la elección se valida contra sus
				// membresías, no contra su rol.
				.requestMatchers(HttpMethod.GET, api("/session/organizations"))
				.authenticated()
				.requestMatchers(HttpMethod.POST, api("/session/organization"))
				.authenticated()
				.requestMatchers(HttpMethod.GET,
						api("/me", "/tickets", "/tickets/{number}", "/tickets/{number}/messages"))
				.authenticated()
				// Todo lo demás de la API es del personal, también lo que no existe: un 404 no revela a un anónimo qué
				// rutas hay, recibe el 401.
				.requestMatchers(api("/**"))
				.hasAnyRole(STAFF)
				// Fuera de la API solo hay la aplicación web (archivos estáticos y el index.html de sus rutas): es
				// pública. Una escritura fuera de /api no llega a ningún controlador, el manejador de recursos solo
				// admite GET.
				.anyRequest()
				.permitAll());
		resolver.ifAvailable((available) -> http.addFilterBefore(new PrincipalResolverFilter(available),
				AuthorizationFilter.class));
		// Los perfiles añaden lo suyo (oidc: sesión, CSRF, inicio y cierre de sesión) sobre estas mismas reglas.
		for (HttpSecurityCustomizer customizer : customizers.orderedStream().toList()) {
			customizer.customize(http);
		}
		return http.build();
	}

}
