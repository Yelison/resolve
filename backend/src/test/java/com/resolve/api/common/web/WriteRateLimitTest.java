package com.resolve.api.common.web;

import java.time.Duration;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 60 escrituras por minuto por IP, con la IP que escribe el proxy ({@code Fly-Client-IP}) y no la que el cliente puede
 * escribir en {@code X-Forwarded-For}. El reloj es el de los tests: sin esperas.
 */
// «framework» es lo que usa prod: envuelve la petición y cambia getRemoteAddr() por el primer X-Forwarded-For.
@TestPropertySource(properties = { "resolve.demo.limits=true", "resolve.demo.client-ip-header=Fly-Client-IP",
		"server.forward-headers-strategy=framework" })
// Cada test usa sus propias direcciones: los cubos viven en la aplicación y el contexto se comparte entre tests.
class WriteRateLimitTest extends ApiIntegrationTest {

	private static MockHttpServletRequestBuilder write(String clientIp) {
		// Sin sesión: responde 401, y cuenta igual (el filtro va antes de la seguridad).
		return post(API + "/tickets").header("Fly-Client-IP", clientIp).contentType("application/json").content("{}");
	}

	private void exhaust(String clientIp) throws Exception {
		for (int i = 0; i < 60; i++) {
			this.mvc.perform(write(clientIp)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void the61stWriteInAMinuteIs429AndReadsAreNeverLimited() throws Exception {
		exhaust("203.0.113.1");

		this.mvc.perform(write("203.0.113.1"))
			.andExpect(status().isTooManyRequests())
			.andExpect(header().string("Content-Type", containsString("application/problem+json")))
			.andExpect(header().string("Retry-After", "60"))
			.andExpect(jsonPath("$.status").value(429))
			.andExpect(jsonPath("$.title").value("Demasiadas escrituras"));
		this.mvc.perform(get(API + "/me").header("Fly-Client-IP", "203.0.113.1")).andExpect(status().isUnauthorized());
	}

	@Test
	void anotherAddressHasItsOwnBucketAndTheWindowSlides() throws Exception {
		exhaust("203.0.113.2");

		this.mvc.perform(write("198.51.100.11")).andExpect(status().isUnauthorized());
		this.clock.advance(Duration.ofSeconds(59));
		this.mvc.perform(write("203.0.113.2")).andExpect(status().isTooManyRequests());
		this.clock.advance(Duration.ofSeconds(1));
		this.mvc.perform(write("203.0.113.2")).andExpect(status().isUnauthorized());
	}

	@Test
	void aForgedXForwardedForDoesNotChangeTheBucket() throws Exception {
		exhaust("203.0.113.3");

		// Mismo Fly-Client-IP, otro X-Forwarded-For en cada petición: sigue en el mismo cubo.
		this.mvc.perform(write("203.0.113.3").header("X-Forwarded-For", "10.9.8.7"))
			.andExpect(status().isTooManyRequests());
		this.mvc.perform(write("203.0.113.3").header("X-Forwarded-For", "1.2.3.4, 5.6.7.8"))
			.andExpect(status().isTooManyRequests());
	}

	@Test
	void ipv6AddressesOfTheSame64ShareABucket() throws Exception {
		for (int i = 1; i <= 60; i++) {
			this.mvc.perform(write("2001:db8:0:1::" + Integer.toHexString(i))).andExpect(status().isUnauthorized());
		}

		this.mvc.perform(write("2001:db8:0:1:ffff::1")).andExpect(status().isTooManyRequests());
		// Otro /64 tiene su propio cubo.
		this.mvc.perform(write("2001:db8:0:2::1")).andExpect(status().isUnauthorized());
	}

	@Test
	void aValueThatIsNotAnAddressFallsBackToTheConnectionInsteadOfOpeningABucketPerValue() throws Exception {
		for (int i = 0; i < 60; i++) {
			this.mvc.perform(write("valor-" + i).header("X-Forwarded-For", "9.9.9." + i))
				.andExpect(status().isUnauthorized());
		}

		this.mvc.perform(write("otro-valor").header("X-Forwarded-For", "9.9.9.99")).andExpect(status().isTooManyRequests());
	}

}
