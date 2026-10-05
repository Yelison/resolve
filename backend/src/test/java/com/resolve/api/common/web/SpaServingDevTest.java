package com.resolve.api.common.web;

import java.util.UUID;

import com.resolve.api.support.TestData;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@link SpaServingTest} con la cadena sin sesión de {@code dev}/{@code test}. */
@ActiveProfiles("test")
class SpaServingDevTest extends SpaServingTest {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private TestData data;

	@Test
	void whatDoesNotExistUnderTheApiIsA404ProblemForStaffNeverTheIndex() throws Exception {
		// El anónimo no llega al manejador de recursos (la seguridad responde 401); el personal sí.
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");

		for (String path : new String[] { "/api", "/api/nada", "/api/tickets/1047/nada", "/api/actuator/nada" }) {
			this.mvc.perform(get(path).header("X-Demo-User", "ana@acme.example"))
				.andExpect(status().isNotFound())
				.andExpect(header().string("Content-Type", containsString("application/problem+json")))
				.andExpect(content().string(not(containsString("root"))));
		}
	}

}
