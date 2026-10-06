package com.resolve.api.common.security;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El realm de demostración (deploy/keycloak) y el cierre de sesión: tras cerrar sesión, Keycloak solo vuelve a una URL
 * de {@code post.logout.redirect.uris}; si falta, muestra «Invalid redirect uri» y la sesión SSO sigue viva.
 */
class KeycloakRealmTest {

	private static final String CALLBACK = "/api/login/oauth2/code/resolve";

	@Test
	void everyOriginThatMayCompleteTheLoginMayAlsoReturnAfterTheLogout() throws Exception {
		JsonNode client = JsonMapper.builder().build().readTree(Files.readString(Path.of("../deploy/keycloak/resolve-realm.json")))
			.get("clients")
			.get(0);
		Set<String> postLogout = new HashSet<>(
				Arrays.asList(client.get("attributes").get("post.logout.redirect.uris").asString().split("##")));
		Set<String> origins = new HashSet<>();
		client.get("redirectUris").forEach((uri) -> {
			assertThat(uri.asString()).endsWith(CALLBACK);
			origins.add(uri.asString().substring(0, uri.asString().length() - CALLBACK.length()));
		});

		// Las del jar (8080-8089), las de Vite y preview, y el origen del compose de producción.
		assertThat(origins).contains("http://localhost:8080", "http://localhost:8089", "http://localhost:5173");
		for (String origin : origins) {
			assertThat(postLogout).as("post.logout.redirect.uris for " + origin).contains(origin, origin + "/");
		}
	}

}
