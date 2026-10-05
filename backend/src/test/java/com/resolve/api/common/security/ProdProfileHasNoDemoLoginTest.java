package com.resolve.api.common.security;

import com.resolve.api.TestcontainersConfiguration;
import com.resolve.api.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El login de demostración ({@code X-Demo-User}) solo existe en {@code dev} y {@code test}, y nunca junto a
 * {@code oidc}. Con {@code prod}, solo o combinado con {@code oidc}, un usuario que sí existe en la base de datos no
 * se autentica con la cabecera.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Import({ TestcontainersConfiguration.class, TestData.class })
class ProdProfileHasNoDemoLoginTest {

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected TestData data;

	@Autowired
	protected Environment environment;

	@BeforeEach
	void seed() {
		this.data.reset();
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");
	}

	@Test
	void theDemoHeaderOfAnExistingUserDoesNothingInProd() throws Exception {
		this.mvc.perform(get("/me").header("X-Demo-User", "ana@acme.example"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.status").value(401));
		assertThat(this.environment.getProperty("resolve.demo.default-user")).isNull();
	}

}
