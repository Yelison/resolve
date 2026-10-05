package com.resolve.api.common.web;

import java.util.List;
import java.util.Set;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La seguridad deja pública toda ruta que no cuelgue de {@code /api}, porque ahí vive la aplicación web. Por eso ningún
 * controlador puede quedar fuera del prefijo: sería una ruta pública sin querer.
 */
class ApiPrefixTest extends ApiIntegrationTest {

	/** Controladores del propio Spring Boot que no son de la API. */
	private static final Set<String> FRAMEWORK = Set.of("/error");

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping mappings;

	@Autowired
	private ServerProperties server;

	@Test
	void everyControllerRouteHangsFromTheApiPrefix() {
		List<String> outside = this.mappings.getHandlerMethods()
			.keySet()
			.stream()
			.map(RequestMappingInfo::getPathPatternsCondition)
			.flatMap((condition) -> condition.getPatternValues().stream())
			.filter((pattern) -> !FRAMEWORK.contains(pattern))
			.filter((pattern) -> !pattern.startsWith(API + "/"))
			.toList();

		assertThat(outside).isEmpty();
		assertThat(this.mappings.getHandlerMethods()).hasSizeGreaterThan(30);
	}

	@Test
	void theApplicationHasNoContextPathSoTheWebAppCanLiveAtTheRoot() {
		assertThat(this.server.getServlet().getContextPath()).isNullOrEmpty();
	}

	@Test
	void theSessionCookieKeepsTheApiPath() {
		assertThat(this.server.getServlet().getSession().getCookie().getPath()).isEqualTo(API);
	}

}
