package com.resolve.api.common.security;

import java.util.List;
import java.util.stream.Stream;

import com.resolve.api.ResolveApiApplication;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Con {@code prod} el arranque falla con un mensaje que nombra la variable que falta. La comprobación unitaria evita
 * levantar el contexto siete veces; la última prueba arranca la aplicación de verdad, con las variables vaciadas por
 * argumentos de línea de órdenes (que pesan más que el entorno de quien ejecute el test).
 */
class RequiredProdConfigurationTest {

	private static final List<String> ALL = List.of("DATABASE_URL", "DATABASE_USERNAME", "DATABASE_PASSWORD",
			"RESOLVE_OIDC_ISSUER", "RESOLVE_OIDC_CLIENT_ID", "RESOLVE_OIDC_CLIENT_SECRET", "RESOLVE_PUBLIC_URL");

	static Stream<String> variables() {
		return ALL.stream();
	}

	@ParameterizedTest
	@MethodSource("variables")
	void aMissingVariableStopsTheStartAndTheMessageNamesIt(String missing) {
		assertThatThrownBy(() -> RequiredProdConfiguration.check(prodWithout(missing)))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("Missing required configuration for the 'prod' profile")
			.hasMessageContaining(missing)
			.satisfies((error) -> ALL.stream()
				.filter((other) -> !other.equals(missing))
				.forEach((other) -> assertThat(error.getMessage()).doesNotContain(other)));
	}

	@ParameterizedTest
	@MethodSource("variables")
	void anEmptyVariableCountsAsMissing(String empty) {
		MockEnvironment environment = prodWithout(empty);
		environment.setProperty(property(empty), "");

		assertThatThrownBy(() -> RequiredProdConfiguration.check(environment)).hasMessageContaining(empty);
	}

	@Test
	void everyVariableAtOnceIsEnoughAndAllMissingOnesAreListedTogether() {
		assertThatCode(() -> RequiredProdConfiguration.check(prodWithout())).doesNotThrowAnyException();
		assertThatThrownBy(() -> RequiredProdConfiguration.check(new MockEnvironment().withProperty("x", "y")
			.withProperty("spring.profiles.active", "prod,oidc")))
			.hasMessageContaining(String.join(", ", ALL.stream().sorted().toList()));
	}

	@Test
	void theOidcVariablesOnlyCountWhenOidcIsActive() {
		MockEnvironment environment = new MockEnvironment();
		environment.setActiveProfiles("prod");
		environment.setProperty("spring.datasource.url", "jdbc:postgresql://db/resolve");
		environment.setProperty("spring.datasource.username", "u");
		environment.setProperty("spring.datasource.password", "p");

		assertThatCode(() -> RequiredProdConfiguration.check(environment)).doesNotThrowAnyException();
	}

	@Test
	void theApplicationReallyRefusesToStartInProdWithoutThem() {
		SpringApplicationBuilder application = new SpringApplicationBuilder(ResolveApiApplication.class)
			.web(WebApplicationType.NONE)
			.profiles("prod", "oidc");

		assertThatThrownBy(() -> application.run("--DATABASE_URL=", "--DATABASE_USERNAME=", "--DATABASE_PASSWORD=",
				"--RESOLVE_OIDC_ISSUER=", "--RESOLVE_OIDC_CLIENT_ID=", "--RESOLVE_OIDC_CLIENT_SECRET=",
				"--RESOLVE_PUBLIC_URL=", "--spring.main.banner-mode=off"))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("DATABASE_URL")
			.hasMessageContaining("RESOLVE_OIDC_CLIENT_SECRET");
	}

	/** Un entorno de prod con oidc donde cada propiedad tiene valor, salvo las de las variables que se indiquen. */
	private static MockEnvironment prodWithout(String... missing) {
		MockEnvironment environment = new MockEnvironment();
		environment.setActiveProfiles("prod", "oidc");
		for (String variable : ALL) {
			if (!List.of(missing).contains(variable)) {
				environment.setProperty(property(variable), "valor-ficticio");
			}
		}
		return environment;
	}

	private static String property(String variable) {
		return switch (variable) {
			case "DATABASE_URL" -> "spring.datasource.url";
			case "DATABASE_USERNAME" -> "spring.datasource.username";
			case "DATABASE_PASSWORD" -> "spring.datasource.password";
			case "RESOLVE_OIDC_ISSUER" -> "spring.security.oauth2.client.provider.resolve.issuer-uri";
			case "RESOLVE_OIDC_CLIENT_ID" -> "spring.security.oauth2.client.registration.resolve.client-id";
			case "RESOLVE_OIDC_CLIENT_SECRET" -> "spring.security.oauth2.client.registration.resolve.client-secret";
			case "RESOLVE_PUBLIC_URL" -> "resolve.public-url";
			default -> throw new IllegalArgumentException(variable);
		};
	}

}
