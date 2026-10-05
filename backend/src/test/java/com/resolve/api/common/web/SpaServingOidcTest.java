package com.resolve.api.common.web;

import com.resolve.api.support.OidcTestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * {@link SpaServingTest} con la cadena de {@code oidc}: la aplicación web tiene que seguir siendo pública (nunca una
 * redirección al proveedor) mientras la API responde 401.
 */
@ActiveProfiles("oidc")
@Import(OidcTestConfiguration.class)
@TestPropertySource(properties = "resolve.public-url=http://localhost:5173")
class SpaServingOidcTest extends SpaServingTest {

}
