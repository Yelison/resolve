package com.resolve.api.common.error;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.resolve.api.support.OidcApiIntegrationTest;
import com.resolve.api.support.OidcTestConfiguration;

/**
 * {@link AbstractProblemErrorTest} con la cadena que se despliega: sesión, CSRF e inicio de sesión OIDC. El rechazo del
 * cortafuegos y la excepción de un filtro tienen que ser Problem Details también aquí.
 */
@ActiveProfiles("oidc")
@Import(OidcTestConfiguration.class)
@TestPropertySource(properties = "resolve.public-url=" + OidcApiIntegrationTest.PUBLIC_URL)
class OidcProblemErrorControllerTest extends AbstractProblemErrorTest {

	@Test
	void theErrorRouteItselfIsClosedToAnonymous() throws Exception {
		problem(get("/api/error", "text/html"), 401);
	}

}
