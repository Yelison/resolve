package com.resolve.api.memberships;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sin {@code resolve.demo.enabled} la bandera existe y es {@code false}: el cliente no tiene que adivinar. */
class DemoFlagOffTest extends ApiIntegrationTest {

	@Test
	void meSaysFalseOutsideTheDemo() throws Exception {
		this.data.staff(this.data.organization("Acme"), "admin", "Ana", "ana@acme.example");

		this.mvc.perform(get(API + "/me").with(as("ana@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.demo").value(false));
	}

}
