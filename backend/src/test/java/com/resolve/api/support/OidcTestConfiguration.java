package com.resolve.api.support;

import java.util.Map;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;

/**
 * Registro del cliente OIDC con URI explícitas del proveedor. Con la propiedad {@code issuer-uri} del perfil
 * {@code oidc}, Spring haría el descubrimiento contra Keycloak al arrancar el contexto, y ni {@code mvn verify} ni la CI
 * pueden depender de él. Al existir este bean, Spring Boot no construye el suyo.
 */
@TestConfiguration(proxyBeanMethods = false)
public class OidcTestConfiguration {

	public static final String END_SESSION_URI = "https://idp.test/realms/resolve/protocol/openid-connect/logout";

	public static final String AUTHORIZATION_URI = "https://idp.test/realms/resolve/protocol/openid-connect/auth";

	@Bean
	ClientRegistrationRepository clientRegistrationRepository() {
		return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("resolve")
			.clientId("resolve-api")
			.clientSecret("secreto-de-prueba")
			.clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
			.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
			.redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
			.scope("openid", "profile", "email")
			.authorizationUri(AUTHORIZATION_URI)
			.tokenUri("https://idp.test/realms/resolve/protocol/openid-connect/token")
			.jwkSetUri("https://idp.test/realms/resolve/protocol/openid-connect/certs")
			.userNameAttributeName("sub")
			.providerConfigurationMetadata(Map.of("end_session_endpoint", END_SESSION_URI))
			.build());
	}

}
