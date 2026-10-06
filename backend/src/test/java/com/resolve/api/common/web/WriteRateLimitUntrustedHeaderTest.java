package com.resolve.api.common.web;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sin {@code resolve.demo.client-ip-header} ninguna cabecera del cliente decide el cubo: cuenta la conexión. */
@TestPropertySource(properties = "resolve.demo.limits=true")
class WriteRateLimitUntrustedHeaderTest extends ApiIntegrationTest {

	@Test
	void changingFlyClientIpOrXForwardedForDoesNotEscapeTheLimit() throws Exception {
		for (int i = 0; i < 60; i++) {
			this.mvc.perform(post(API + "/tickets").header("Fly-Client-IP", "10.0.0." + i)
				.header("X-Forwarded-For", "10.1.0." + i)
				.contentType("application/json")
				.content("{}")).andExpect(status().isUnauthorized());
		}

		this.mvc.perform(post(API + "/tickets").header("Fly-Client-IP", "10.0.1.1")
			.header("X-Forwarded-For", "10.1.1.1")
			.contentType("application/json")
			.content("{}")).andExpect(status().isTooManyRequests());
	}

}
