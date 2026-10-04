package com.resolve.api.common.security;

import com.resolve.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sin perfil dev ni test no existe autenticación de demostración: la API entera responde 401. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DefaultProfileSecurityTest {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private Environment environment;

	@Test
	void rejectsEveryApiCallEvenWithTheDemoHeader() throws Exception {
		this.mvc.perform(get("/me").header("X-Demo-User", "yelisson.ortiz@acme.example"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.status").value(401));
	}

	@Test
	void doesNotLoadTheDemoData() {
		assertThat(this.environment.getProperty("spring.flyway.locations")).isEqualTo("classpath:db/migration");
		assertThat(this.environment.getProperty("resolve.demo.default-user")).isNull();
	}

	@Test
	void keepsTheHealthEndpointPublic() throws Exception {
		this.mvc.perform(get("/actuator/health")).andExpect(status().isOk());
	}

}
