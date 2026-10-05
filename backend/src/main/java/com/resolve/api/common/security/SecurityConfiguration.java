package com.resolve.api.common.security;

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
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

	private static final String[] STAFF = { "ADMIN", "AGENT" };

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http, ObjectProvider<PrincipalResolver> resolver, JsonMapper jsonMapper)
			throws Exception {
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
				.requestMatchers("/actuator/health", "/actuator/health/**")
				.permitAll()
				// Archivar, restaurar e invitar clientes es solo de administradores (Q-02); va antes de la regla general.
				.requestMatchers(HttpMethod.POST, "/customers/{id}/archive", "/customers/{id}/restore",
						"/customers/{id}/invite")
				.hasRole("ADMIN")
				// Invitar, cambiar el rol y retirar miembros es solo de administradores; el equipo lo lee el personal.
				.requestMatchers(HttpMethod.POST, "/members", "/members/{userId}/role", "/members/{userId}/remove")
				.hasRole("ADMIN")
				// Los informes y el feed de actividad son del personal. «/tickets/activity» tiene que estar en esta regla,
				// que va antes de «/tickets/{number}»: ese patrón también la reconoce y dejaría pasar a un cliente.
				.requestMatchers(HttpMethod.GET, "/tickets/metrics", "/tickets/activity", "/tickets/{number}/activity",
						"/customers", "/customers/**", "/assignees", "/members", "/members/metrics",
						"/reports/summary")
				.hasAnyRole(STAFF)
				.requestMatchers(HttpMethod.GET, "/me", "/tickets", "/tickets/{number}", "/tickets/{number}/messages")
				.authenticated()
				.anyRequest()
				.hasAnyRole(STAFF));
		resolver.ifAvailable((available) -> http.addFilterBefore(new PrincipalResolverFilter(available),
				AuthorizationFilter.class));
		return http.build();
	}

}
