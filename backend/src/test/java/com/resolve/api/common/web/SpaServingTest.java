package com.resolve.api.common.web;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.Comparator;
import java.util.stream.Stream;

import com.resolve.api.TestcontainersConfiguration;
import com.resolve.api.support.TestData;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.handler.SimpleUrlHandlerMapping;
import org.springframework.web.servlet.resource.CachingResourceResolver;
import org.springframework.web.servlet.resource.ResourceHttpRequestHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La aplicación web servida desde la API, con un {@code dist} de mentira en un directorio temporal (los tests no
 * dependen de que el frontend esté compilado). Se ejecuta con la cadena de {@code dev}/{@code test} y con la de
 * {@code oidc}: las dos tienen que dejar pública la aplicación web y cerrada la API.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, TestData.class })
abstract class SpaServingTest {

	static final String INDEX = "<!doctype html><title>Resolve</title><div id=\"root\"></div>";

	private static final Path DIST = distribution();

	@Autowired
	private MockMvc mvc;

	@Autowired
	private WebProperties web;

	@Autowired
	@Qualifier("resourceHandlerMapping")
	private SimpleUrlHandlerMapping resourceMapping;

	@DynamicPropertySource
	static void webLocation(DynamicPropertyRegistry registry) {
		registry.add("resolve.web.location", () -> DIST.toUri().toString());
	}

	private static Path distribution() {
		try {
			Path dist = Files.createTempDirectory("resolve-dist");
			// Los contextos de Spring se comparten entre las clases del mismo perfil de propiedades: el directorio vive
			// lo que la JVM.
			Runtime.getRuntime().addShutdownHook(new Thread(() -> delete(dist)));
			Files.writeString(dist.resolve("index.html"), INDEX);
			Files.writeString(dist.resolve("favicon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
			Files.createDirectories(dist.resolve("assets"));
			Files.writeString(dist.resolve("assets/index-3fa9c1.js"), "console.log('resolve')");
			return dist;
		}
		catch (IOException exception) {
			throw new IllegalStateException(exception);
		}
	}

	private static void delete(Path directory) {
		try (Stream<Path> files = Files.walk(directory)) {
			files.sorted(Comparator.reverseOrder()).forEach((file) -> file.toFile().delete());
		}
		catch (IOException ignored) {
			// Es un directorio temporal: si no se puede borrar, lo hará el sistema.
		}
	}

	@Test
	void springBootsOwnStaticHandlerIsOffSoThereIsOnlyOneForTheRoot() {
		assertThat(this.web.getResources().isAddMappings()).isFalse();
	}

	@Test
	void theFallbackRoutesAreNotCachedInAnUnboundedMap() {
		// Una cadena con caché guardaría una entrada por cada ruta distinta que resuelve al índice, sin límite.
		ResourceHttpRequestHandler handler = (ResourceHttpRequestHandler) this.resourceMapping.getUrlMap().get("/**");

		assertThat(handler.getResourceResolvers()).hasAtLeastOneElementOfType(SpaResourceResolver.class)
			.doesNotHaveAnyElementsOfTypes(CachingResourceResolver.class);
	}

	@Test
	void theRootIsForwardedToTheIndexWithoutAuthentication() throws Exception {
		// MockMvc no sigue el reenvío; con el jar real la raíz responde el índice (se comprueba a mano y en la
		// entrega).
		this.mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
		this.mvc.perform(get("/index.html"))
			.andExpect(status().isOk())
			.andExpect(content().string(INDEX))
			.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache"));
	}

	@Test
	void reloadingARouteOfTheWebAppServesTheIndex() throws Exception {
		for (String route : new String[] { "/tickets/1047", "/conocimiento/recuperar-el-acceso-a-tu-cuenta",
				"/entrar", "/clientes/3f2c" }) {
			this.mvc.perform(get(route))
				.andExpect(status().isOk())
				.andExpect(content().string(INDEX))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache"));
		}
	}

	@Test
	void theIndexIsRevalidatedByContentSoANewDeploymentIsNeverAnswered304() throws Exception {
		// El jar fija la fecha de todos sus archivos: un despliegue nuevo trae otro index.html con la misma fecha (y a
		// menudo el mismo tamaño, porque solo cambian los hashes de los scripts).
		Path index = DIST.resolve("index.html");
		FileTime sameTime = Files.getLastModifiedTime(index);
		String etag = this.mvc.perform(get("/tickets/1047"))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getHeader(HttpHeaders.ETAG);
		assertThat(etag).isNotBlank();
		this.mvc.perform(get("/tickets/1047").header(HttpHeaders.IF_NONE_MATCH, etag))
			.andExpect(status().isNotModified());
		try {
			String redeployed = INDEX.replace("Resolve", "Resolvf");
			assertThat(redeployed).hasSameSizeAs(INDEX);
			Files.writeString(index, redeployed);
			Files.setLastModifiedTime(index, sameTime);

			this.mvc.perform(get("/tickets/1047").header(HttpHeaders.IF_NONE_MATCH, etag)
				.header(HttpHeaders.IF_MODIFIED_SINCE, sameTime.toMillis()))
				.andExpect(status().isOk())
				.andExpect(content().string(redeployed));
		}
		finally {
			Files.writeString(index, INDEX);
			Files.setLastModifiedTime(index, sameTime);
		}
	}

	@Test
	void hashedAssetsAreCachedForAYearAndNeverChange() throws Exception {
		this.mvc.perform(get("/assets/index-3fa9c1.js"))
			.andExpect(status().isOk())
			.andExpect(content().string("console.log('resolve')"))
			.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=31536000, public, immutable"));
	}

	@Test
	void anAssetThatDoesNotExistIsA404NotTheIndex() throws Exception {
		this.mvc.perform(get("/assets/index-viejo.js"))
			.andExpect(status().isNotFound())
			.andExpect(content().string(not(containsString("root"))));
	}

	@Test
	void otherStaticFilesAreServedAsTheyAreAndRevalidated() throws Exception {
		this.mvc.perform(get("/favicon.svg"))
			.andExpect(status().isOk())
			.andExpect(content().string(containsString("<svg")))
			.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache"));
	}

	@Test
	void theApiIsNeverTheIndex() throws Exception {
		// Sin sesión, todo lo que cuelga de /api es una API cerrada: 401 Problem, también lo que no existe y la propia
		// raíz.
		for (String path : new String[] { "/api", "/api/nada", "/api/tickets/1047", "/api/actuator/info" }) {
			this.mvc.perform(get(path))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/problem+json")))
				.andExpect(content().string(not(containsString("root"))));
		}
	}

	@Test
	void theErrorPathIsARouteOfTheWebAppAndTheErrorControllerLivesUnderTheApi() throws Exception {
		// El BasicErrorController de Spring Boot no es de la API ni de la aplicación web: bajo /api queda cerrado.
		this.mvc.perform(get("/error")).andExpect(status().isOk()).andExpect(content().string(INDEX));
		this.mvc.perform(get("/api/error"))
			.andExpect(status().isUnauthorized())
			.andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/problem+json")));
	}

	@Test
	void theHealthEndpointIsPublicUnderTheApiPrefix() throws Exception {
		this.mvc.perform(get("/api/actuator/health"))
			.andExpect(status().isOk())
			.andExpect(content().string(containsString("UP")));
	}

	@Test
	void actuatorAtTheRootIsNotTheIndexEither() throws Exception {
		for (String path : new String[] { "/actuator", "/actuator/health", "/actuator/env" }) {
			this.mvc.perform(get(path))
				.andExpect(status().isNotFound())
				.andExpect(content().string(not(containsString("root"))));
		}
	}

	@Test
	void anonymousWritesOutsideTheApiReachTheStaticHandlerWhichRefusesThem() throws Exception {
		// Un 405 y no un 401: fuera de /api todo es público, y el manejador de recursos solo acepta GET y HEAD. El
		// token CSRF va para que, con oidc, el 403 de CSRF no se adelante.
		this.mvc.perform(post("/tickets/1047").cookie(new Cookie("XSRF-TOKEN", "t")).header("X-XSRF-TOKEN", "t"))
			.andExpect(status().isMethodNotAllowed());
	}

	@Test
	void headWorksLikeGetWithoutBody() throws Exception {
		this.mvc.perform(head("/tickets/1047")).andExpect(status().isOk()).andExpect(content().string(""));
	}

	@Test
	void theLoginEndpointsAreUnderTheApiPrefixNotAtTheRoot() throws Exception {
		// Fuera de /api son rutas de la aplicación web: ni el inicio de sesión de OIDC ni su cierre viven ahí.
		for (String path : new String[] { "/oauth2/authorization/resolve", "/login/oauth2/code/resolve", "/login",
				"/logout" }) {
			this.mvc.perform(get(path))
				.andExpect(status().isOk())
				.andExpect(content().string(INDEX))
				.andExpect(header().doesNotExist(HttpHeaders.LOCATION));
		}
	}

}
