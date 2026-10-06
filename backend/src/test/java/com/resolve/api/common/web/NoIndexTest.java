package com.resolve.api.common.web;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@code X-Robots-Tag: noindex} en toda respuesta de una demostración, también en las que no llegan a un controlador. */
@TestPropertySource(properties = "resolve.demo.enabled=true")
class NoIndexTest extends ApiIntegrationTest {

	@Test
	void everyResponseOfADemoIsNoindex() throws Exception {
		this.mvc.perform(get(API + "/me")).andExpect(status().isUnauthorized()).andExpect(header().string("X-Robots-Tag", "noindex"));
		this.mvc.perform(get("/")).andExpect(header().string("X-Robots-Tag", "noindex"));
		this.mvc.perform(get(API + "/actuator/health")).andExpect(header().string("X-Robots-Tag", "noindex"));
	}

}
