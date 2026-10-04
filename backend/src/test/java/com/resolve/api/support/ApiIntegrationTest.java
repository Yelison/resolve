package com.resolve.api.support;

import com.resolve.api.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Base de los tests de la API: aplicación completa sobre PostgreSQL real (Testcontainers), perfil {@code test}
 * con autenticación de demostración y tablas vacías antes de cada test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({ TestcontainersConfiguration.class, TestData.class, TestClockConfiguration.class })
public abstract class ApiIntegrationTest {

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected TestData data;

	@Autowired
	protected MutableClock clock;

	@BeforeEach
	void resetDatabase() {
		this.data.reset();
		this.clock.set(TestClockConfiguration.START);
	}

	/** Autentica la petición como el usuario sembrado con ese correo. */
	protected static RequestPostProcessor as(String email) {
		return (request) -> {
			request.addHeader("X-Demo-User", email);
			return request;
		};
	}

}
