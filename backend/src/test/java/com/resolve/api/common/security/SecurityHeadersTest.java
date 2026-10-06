package com.resolve.api.common.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Comparator;
import java.util.stream.Stream;

import com.resolve.api.support.OidcApiIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cabeceras de seguridad de la aplicación web y de la API, y qué respuestas pueden llevar cookies. La aplicación web
 * es un {@code dist} de mentira con un script en línea, como el del tema en el {@code index.html} de Vite.
 */
class SecurityHeadersTest extends OidcApiIntegrationTest {

	private static final String THEME_SCRIPT = "\n      try { localStorage.getItem('resolve-theme') } catch (error) {}\n    ";

	private static final Path DIST = distribution();

	@DynamicPropertySource
	static void webLocation(DynamicPropertyRegistry registry) {
		registry.add("resolve.web.location", () -> DIST.toUri().toString());
	}

	@BeforeEach
	void seed() {
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
	}

	private static Path distribution() {
		try {
			Path dist = Files.createTempDirectory("resolve-dist-headers");
			Runtime.getRuntime().addShutdownHook(new Thread(() -> delete(dist)));
			Files.writeString(dist.resolve("index.html"), "<!doctype html><head><script>" + THEME_SCRIPT
					+ "</script><script type=\"module\" src=\"/assets/index-3fa9c1.js\"></script></head><div id=\"root\"></div>");
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
			// Directorio temporal.
		}
	}

	@Test
	void theContentPolicyAdmitsOnlyTheOwnOriginAndTheHashOfTheInlineThemeScript() throws Exception {
		String hash = Base64.getEncoder()
			.encodeToString(MessageDigest.getInstance("SHA-256").digest(THEME_SCRIPT.getBytes(StandardCharsets.UTF_8)));

		for (String path : new String[] { "/", "/tickets/1047", "/assets/index-3fa9c1.js", API + "/me" }) {
			this.mvc.perform(get(path))
				.andExpect(header().string("Content-Security-Policy",
						"default-src 'self'; script-src 'self' 'sha256-" + hash + "'; style-src 'self'; "
								+ "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
								+ "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"))
				.andExpect(header().string("X-Content-Type-Options", "nosniff"))
				.andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));
		}
	}

	@Test
	void hstsIsOnlySentOverHttps() throws Exception {
		this.mvc.perform(get("/").secure(true))
			.andExpect(header().string("Strict-Transport-Security", "max-age=31536000 ; includeSubDomains"));
		this.mvc.perform(get("/")).andExpect(header().doesNotExist("Strict-Transport-Security"));
	}

	@Test
	void theCacheableAssetsKeepTheirCachePolicyAndCarryNoCookie() throws Exception {
		MvcResult asset = this.mvc.perform(get("/assets/index-3fa9c1.js"))
			.andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"))
			.andReturn();

		// Una caché compartida guardaría un Set-Cookie junto al archivo y serviría el mismo token a todo el mundo.
		assertThat(asset.getResponse().getHeaders("Set-Cookie")).isEmpty();
		assertThat(asset.getResponse().getCookies()).isEmpty();
	}

	@Test
	void noPageOfTheWebAppSetsACookieEvenWithASessionOpen() throws Exception {
		for (String path : new String[] { "/", "/index.html", "/tickets/1047", "/entrar", "/favicon.svg",
				"/assets/index-3fa9c1.js", "/assets/no-existe.js" }) {
			MvcResult result = this.mvc.perform(get(path).session(signedIn("laura@acme.example"))).andReturn();
			assertThat(result.getResponse().getHeaders("Set-Cookie")).as(path).isEmpty();
			assertThat(result.getResponse().getCookies()).as(path).isEmpty();
		}
	}

	@Test
	void theApiStillSetsTheCsrfCookieAndItIsSecure() throws Exception {
		MvcResult result = this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(header().string("Set-Cookie", containsString("XSRF-TOKEN=")))
			.andExpect(header().string("Set-Cookie", containsString("Secure")))
			.andReturn();

		Cookie csrf = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(csrf).isNotNull();
		assertThat(csrf.getSecure()).isTrue();
		// Incluso la respuesta 401 de un anónimo la trae: el cliente la necesita antes de su primer POST.
		this.mvc.perform(get(API + "/me")).andExpect(status().isUnauthorized())
			.andExpect(header().string("Set-Cookie", containsString("XSRF-TOKEN=")));
	}

}
