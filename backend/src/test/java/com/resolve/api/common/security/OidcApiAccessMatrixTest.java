package com.resolve.api.common.security;

import java.util.Map;
import java.util.UUID;

import com.resolve.api.support.ApiAccess;
import com.resolve.api.support.ApiAccess.Role;
import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Lo mismo que {@link ApiAccessMatrixTest} contra la cadena del perfil {@code oidc}, que tiene sus propias reglas de
 * sesión y CSRF sobre las mismas de autorización: cada rol entra con una sesión como la que deja el inicio de sesión
 * real y el anónimo llega con el token CSRF para que un 403 de CSRF no tape un 401. Nunca una redirección al
 * proveedor.
 */
class OidcApiAccessMatrixTest extends OidcApiIntegrationTest {

	@Test
	void everyOperationAnswersAsTheTableSaysForEveryRoleAndForAnonymous() throws Exception {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");
		this.data.staff(acme, "agent", "Alberto", "alberto@acme.example");
		UUID customer = this.data.customer(acme, "Clara", "clara@cliente.example", "Cliente SA");
		this.data.customerUser(acme, customer, "Clara", "clara@cliente.example");

		Map<Role, RequestPostProcessor> credentials = Map.of(Role.ADMIN, signedInWithCsrf("ana@acme.example"),
				Role.AGENT, signedInWithCsrf("alberto@acme.example"), Role.CUSTOMER,
				signedInWithCsrf("clara@cliente.example"));

		assertThat(ApiAccess.violations(this.mvc, credentials, csrfToken())).isEmpty();
	}

	@Test
	void logoutIsOpenToAnyoneWhoSendsTheCsrfHeaderAndToNoOneWithout() throws Exception {
		this.mvc.perform(post(API + "/logout").with(csrfToken()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.logoutUrl").value(OidcApiIntegrationTest.PUBLIC_URL));
		this.mvc.perform(post(API + "/logout"))
			.andExpect(status().isForbidden())
			.andExpect(header().doesNotExist("Location"));
	}

	private static RequestPostProcessor signedInWithCsrf(String email) {
		RequestPostProcessor csrf = csrfToken();
		return (request) -> {
			request.setSession(signedIn(email));
			return csrf.postProcessRequest(request);
		};
	}

}
