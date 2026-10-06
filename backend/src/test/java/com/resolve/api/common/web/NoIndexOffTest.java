package com.resolve.api.common.web;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

/** Fuera de una demostración la cabecera no existe. */
class NoIndexOffTest extends ApiIntegrationTest {

	@Test
	void withoutTheDemoFlagThereIsNoRobotsHeader() throws Exception {
		this.mvc.perform(get(API + "/me")).andExpect(header().doesNotExist("X-Robots-Tag"));
	}

}
