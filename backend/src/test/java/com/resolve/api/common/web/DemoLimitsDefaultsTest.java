package com.resolve.api.common.web;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Los valores por defecto del plan (§4.5-5) y que, sin {@code resolve.demo.limits}, ningún tope actúa. */
@TestPropertySource(properties = "resolve.demo.cap.customers=0")
class DemoLimitsDefaultsTest extends ApiIntegrationTest {

	@Autowired
	private DemoLimits limits;

	@Test
	void theDefaultCapsAreTheOnesOfThePlan() {
		assertThat(this.limits.cap(DemoLimits.Resource.TICKETS)).isEqualTo(500);
		assertThat(this.limits.cap(DemoLimits.Resource.MEMBERS)).isEqualTo(50);
		assertThat(this.limits.cap(DemoLimits.Resource.ARTICLES)).isEqualTo(100);
		// El de clientes (200) se baja aquí a cero para la prueba de abajo.
		assertThat(this.limits.cap(DemoLimits.Resource.CUSTOMERS)).isZero();
	}

	@Test
	void withoutTheLimitsFlagNoCapApplies() throws Exception {
		this.data.staff(this.data.organization("Acme"), "admin", "Ana", "ana@acme.example");

		this.mvc.perform(post(API + "/customers").with(as("ana@acme.example"))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Nuevo\", \"email\": \"n@cliente.example\"}"))
			.andExpect(status().isCreated());
	}

}
