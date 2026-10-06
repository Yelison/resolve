package com.resolve.api.common.security;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * Con el perfil {@code prod} el arranque falla, y dice qué variables faltan, si alguna de las que no tienen valor por
 * defecto no está definida o está vacía.
 *
 * <p>
 * Sin esta comprobación, no habría un mensaje claro: el enlace de {@code @ConfigurationProperties} deja un
 * {@code ${DATABASE_URL}} sin resolver como texto literal, y el error sería «'url' must start with "jdbc"» o, peor, un
 * rechazo de PostgreSQL al usuario «${DATABASE_USERNAME}». Se ejecuta como {@link BeanFactoryPostProcessor}, antes de
 * crear ningún bean (la base de datos, el cliente OIDC).
 */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
class RequiredProdConfiguration {

	/** Propiedad → variable de entorno que la rellena (application.properties y application-prod.properties). */
	private static final Map<String, String> DATABASE = Map.of("spring.datasource.url", "DATABASE_URL",
			"spring.datasource.username", "DATABASE_USERNAME", "spring.datasource.password", "DATABASE_PASSWORD",
			"resolve.demo.enabled", "RESOLVE_DEMO_ENABLED");

	private static final Map<String, String> OIDC = Map.of(
			"spring.security.oauth2.client.provider.resolve.issuer-uri", "RESOLVE_OIDC_ISSUER",
			"spring.security.oauth2.client.registration.resolve.client-id", "RESOLVE_OIDC_CLIENT_ID",
			"spring.security.oauth2.client.registration.resolve.client-secret", "RESOLVE_OIDC_CLIENT_SECRET",
			"resolve.public-url", "RESOLVE_PUBLIC_URL");

	@Bean
	static BeanFactoryPostProcessor requiredVariables(Environment environment) {
		return (beanFactory) -> check(environment);
	}

	static void check(Environment environment) {
		Map<String, String> required = new LinkedHashMap<>(DATABASE);
		if (environment.acceptsProfiles(Profiles.of("oidc"))) {
			required.putAll(OIDC);
		}
		List<String> missing = new ArrayList<>();
		required.forEach((property, variable) -> {
			if (isMissing(environment, property)) {
				missing.add(variable);
			}
		});
		if (!missing.isEmpty()) {
			throw new IllegalStateException("Missing required configuration for the 'prod' profile, which has no defaults: "
					+ String.join(", ", missing.stream().sorted().toList())
					+ ". Define them as environment variables (see docs/deploy/README.md).");
		}
	}

	private static boolean isMissing(Environment environment, String property) {
		try {
			String value = environment.getProperty(property);
			return value == null || value.isBlank();
		}
		catch (IllegalArgumentException unresolvedPlaceholder) {
			return true;
		}
	}

}
