package com.resolve.api.support;

import com.resolve.api.TestcontainersConfiguration;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestContextManager;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Un contexto {@code prod} deja la consola en ECS, y los listeners registrados la devuelven a texto al terminar
 * su clase. Aquí se simula esa secuencia en una sola JVM, sin depender del orden de Surefire: primero el contexto
 * {@code prod} (en ECS), después el cierre de la clase, y la salida posterior vuelve a ser texto.
 */
@SpringBootTest
@ActiveProfiles({ "prod", "oidc" })
@Import({ TestcontainersConfiguration.class, TestData.class, OidcTestConfiguration.class })
@TestPropertySource(properties = { "DATABASE_URL=jdbc:postgresql://db.invalid/resolve", "DATABASE_USERNAME=resolve",
		"DATABASE_PASSWORD=ficticia", "RESOLVE_OIDC_ISSUER=https://idp.invalid/realms/resolve",
		"RESOLVE_OIDC_CLIENT_ID=resolve-api", "RESOLVE_OIDC_CLIENT_SECRET=ficticio",
		"RESOLVE_PUBLIC_URL=https://resolve.invalid", "RESOLVE_DEMO_ENABLED=false" })
@ExtendWith(OutputCaptureExtension.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RestoreLoggingFormatListenerTest {

	private static final Logger log = LoggerFactory.getLogger(RestoreLoggingFormatListenerTest.class);

	@Test
	@Order(1)
	void aProdContextWritesTheConsoleAsEcs(CapturedOutput output) {
		log.info("marca-ecs");

		assertThat(output.getAll()).contains("\"message\":\"marca-ecs\"").contains("\"ecs\":{\"version\"");
	}

	@Test
	@Order(2)
	void afterTheClassEndsTheRegisteredListenersLeaveTheConsoleAsTextAgain(CapturedOutput output) throws Exception {
		// Los mismos listeners que Spring aplica a esta clase, con lo registrado en META-INF/spring.factories.
		new TestContextManager(getClass()).afterTestClass();

		log.info("marca-texto");

		assertThat(output.getAll()).contains("marca-texto").doesNotContain("\"message\":\"marca-texto\"");
	}

}
