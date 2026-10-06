package com.resolve.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.bootstrap.DefaultBootstrapContext;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.DefaultResourceLoader;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * La configuración de cada perfil, leída como la lee Spring Boot al arrancar pero sin contexto, sin Docker y, sobre
 * todo, sin las variables de entorno ni las propiedades del sistema de quien ejecuta el test (un slot de Herdr exporta
 * {@code DATABASE_URL} y compañía): el resultado no depende del shell.
 */
class ProfileConfigurationTest {

	/** Las variables sin las que {@code prod,oidc} no arranca, con un valor ficticio cada una. */
	private enum Required {

		DATABASE_URL("jdbc:postgresql://db.invalid:5432/resolve"),
		DATABASE_USERNAME("resolve_app"),
		DATABASE_PASSWORD("clave-ficticia"),
		RESOLVE_OIDC_ISSUER("https://idp.invalid/realms/resolve"),
		RESOLVE_OIDC_CLIENT_ID("resolve-api"),
		RESOLVE_OIDC_CLIENT_SECRET("secreto-ficticio"),
		RESOLVE_PUBLIC_URL("https://resolve.invalid"),
		RESOLVE_DEMO_ENABLED("true");

		private final String dummy;

		Required(String dummy) {
			this.dummy = dummy;
		}

	}

	private static final List<String> RESOLVED_KEYS = List.of("spring.datasource.url", "spring.datasource.username",
			"spring.datasource.password", "spring.security.oauth2.client.provider.resolve.issuer-uri",
			"spring.security.oauth2.client.registration.resolve.client-id",
			"spring.security.oauth2.client.registration.resolve.client-secret", "resolve.public-url", "resolve.demo.enabled");

	@Test
	void prodWithEveryVariableResolvesThemAll() {
		ConfigurableEnvironment environment = environment(allVariables(), "prod", "oidc");

		assertThat(environment.getProperty("spring.datasource.url")).isEqualTo(Required.DATABASE_URL.dummy);
		assertThat(environment.getProperty("spring.datasource.username")).isEqualTo(Required.DATABASE_USERNAME.dummy);
		assertThat(environment.getProperty("spring.datasource.password")).isEqualTo(Required.DATABASE_PASSWORD.dummy);
		assertThat(environment.getProperty("spring.security.oauth2.client.provider.resolve.issuer-uri"))
			.isEqualTo(Required.RESOLVE_OIDC_ISSUER.dummy);
		assertThat(environment.getProperty("spring.security.oauth2.client.registration.resolve.client-id"))
			.isEqualTo(Required.RESOLVE_OIDC_CLIENT_ID.dummy);
		assertThat(environment.getProperty("spring.security.oauth2.client.registration.resolve.client-secret"))
			.isEqualTo(Required.RESOLVE_OIDC_CLIENT_SECRET.dummy);
		assertThat(environment.getProperty("resolve.public-url")).isEqualTo(Required.RESOLVE_PUBLIC_URL.dummy);
		assertThat(environment.getProperty("resolve.demo.enabled")).isEqualTo(Required.RESOLVE_DEMO_ENABLED.dummy);
	}

	@Test
	void prodNeverLetsTheApplicationRunFlywayClean() {
		ConfigurableEnvironment environment = environment(allVariables(), "prod", "oidc");

		assertThat(environment.getProperty("spring.flyway.clean-disabled")).isEqualTo("true");
	}

	@Test
	void theDemoFlagsDefaultToOffOutsideProdAndTheLimitsToOffEverywhere() {
		ConfigurableEnvironment dev = environment(new LinkedHashMap<>(), "dev");
		assertThat(dev.getProperty("resolve.demo.enabled")).isEqualTo("false");
		assertThat(dev.getProperty("resolve.demo.limits")).isEqualTo("false");
		assertThat(environment(allVariables(), "prod", "oidc").getProperty("resolve.demo.limits")).isEqualTo("false");
	}

	@ParameterizedTest
	@EnumSource(Required.class)
	void prodAndOidcHaveNoDefaultForAnyRequiredVariable(Required missing) {
		Map<String, Object> variables = allVariables();
		variables.remove(missing.name());

		// Sin la variable, alguna de las propiedades que la usan no se puede resolver (no hay valor por defecto que la
		// tape); el orden de los perfiles no importa: con «oidc,prod» ocurre lo mismo. Que el arranque falle con un
		// mensaje claro lo comprueba RequiredProdConfigurationTest.
		for (String[] profiles : new String[][] { { "prod", "oidc" }, { "oidc", "prod" } }) {
			ConfigurableEnvironment environment = environment(variables, profiles);
			assertThatThrownBy(() -> RESOLVED_KEYS.forEach(environment::getProperty))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("Could not resolve placeholder '" + missing.name() + "'");
		}
	}

	@ParameterizedTest
	@EnumSource(value = Required.class, names = { "DATABASE_URL", "DATABASE_USERNAME", "DATABASE_PASSWORD" })
	void prodAloneStillRequiresTheDatabase(Required missing) {
		Map<String, Object> variables = allVariables();
		variables.remove(missing.name());

		ConfigurableEnvironment environment = environment(variables, "prod");

		assertThatThrownBy(() -> RESOLVED_KEYS.forEach(environment::getProperty))
			.hasMessageContaining("Could not resolve placeholder '" + missing.name() + "'");
	}

	@Test
	void prodKeepsTheCookieSecureAgainstResolvesOwnVariableAndShowsNoStacktraces() {
		Map<String, Object> variables = allVariables();
		variables.put("RESOLVE_SESSION_COOKIE_SECURE", "false");

		ConfigurableEnvironment environment = environment(variables, "prod", "oidc");

		// Ninguna variable de Resolve la baja. La de Spring, SERVER_SERVLET_SESSION_COOKIE_SECURE, sí (el entorno pesa más
		// que los archivos): no debe definirse en prod (docs/deploy/README.md).
		assertThat(environment.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
		// La propiedad antigua (server.error...) ya no la lee Spring Boot 4.1.
		assertThat(environment.getProperty("spring.web.error.include-stacktrace")).isEqualTo("never");
		assertThat(environment.getProperty("server.error.include-stacktrace")).isNull();
	}

	@Test
	void prodUsesOnlyTheRealMigrationsAndTheEcsLogFormat() {
		ConfigurableEnvironment environment = environment(allVariables(), "prod", "oidc");

		assertThat(environment.getProperty("spring.flyway.locations")).isEqualTo("classpath:db/migration");
		assertThat(environment.getProperty("logging.structured.format.console")).isEqualTo("ecs");
		assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
		assertThat(environment.getProperty("management.endpoint.health.probes.enabled")).isEqualTo("true");
		assertThat(environment.getProperty("resolve.demo.default-user")).isNull();
	}

	@Test
	void developmentWithOidcKeepsItsLocalDefaults() {
		ConfigurableEnvironment environment = environment(new LinkedHashMap<>(), "dev", "oidc");

		assertThat(environment.getProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://localhost:5432/resolve");
		assertThat(environment.getProperty("spring.security.oauth2.client.provider.resolve.issuer-uri"))
			.isEqualTo("http://localhost:8180/realms/resolve");
		assertThat(environment.getProperty("spring.security.oauth2.client.registration.resolve.client-id"))
			.isEqualTo("resolve-api");
		assertThat(environment.getProperty("resolve.public-url")).isEqualTo("http://localhost:5173");
		assertThat(environment.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
		assertThat(environment.getProperty("spring.flyway.locations")).contains("db/demo");
	}

	@Test
	void oidcAloneKeepsItsLocalDefaultsAndTheVariablesStillOverrideThem() {
		Map<String, Object> variables = new LinkedHashMap<>();
		variables.put("RESOLVE_OIDC_ISSUER", "http://localhost:8182/realms/resolve");
		variables.put("RESOLVE_PUBLIC_URL", "http://localhost:5182");

		ConfigurableEnvironment environment = environment(variables, "oidc");

		assertThat(environment.getProperty("spring.security.oauth2.client.provider.resolve.issuer-uri"))
			.isEqualTo("http://localhost:8182/realms/resolve");
		assertThat(environment.getProperty("resolve.public-url")).isEqualTo("http://localhost:5182");
		assertThat(environment.getProperty("spring.security.oauth2.client.registration.resolve.client-secret"))
			.isEqualTo("resolve-dev-secret");
	}

	@Test
	void withoutOidcNoClientIsRegistered() {
		ConfigurableEnvironment environment = environment(new LinkedHashMap<>(), "dev");

		assertThat(environment.getProperty("spring.security.oauth2.client.registration.resolve.client-id")).isNull();
		assertThat(environment.getProperty("spring.security.oauth2.client.provider.resolve.issuer-uri")).isNull();
	}

	private static Map<String, Object> allVariables() {
		Map<String, Object> variables = new LinkedHashMap<>();
		for (Required required : Required.values()) {
			variables.put(required.name(), required.dummy);
		}
		return variables;
	}

	/** El entorno de Spring Boot al arrancar con esos perfiles, cuyas únicas fuentes son los archivos y las variables dadas. */
	private static ConfigurableEnvironment environment(Map<String, Object> variables, String... profiles) {
		StandardEnvironment environment = new StandardEnvironmentWithout();
		environment.getPropertySources().addFirst(new MapPropertySource("variables", variables));
		ConfigDataEnvironmentPostProcessor.applyTo(environment, new DefaultResourceLoader(),
				new DefaultBootstrapContext(), profiles);
		return environment;
	}

	/** Un entorno estándar sin {@code systemEnvironment} ni {@code systemProperties}. */
	private static final class StandardEnvironmentWithout extends StandardEnvironment {

		@Override
		protected void customizePropertySources(MutablePropertySources propertySources) {
		}

	}

}
