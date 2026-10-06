package com.resolve.api.common.error;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

import com.resolve.api.TestcontainersConfiguration;
import com.resolve.api.support.TestData;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lo que el contenedor redirige a {@code /api/error} (una ruta sin manejador, un rechazo del cortafuegos de Spring
 * Security, una excepción de un filtro) responde con Problem Details y nada más, sea cual sea la cabecera
 * {@code Accept}: ni el JSON propio de Spring Boot ni una página HTML. Con un servidor real, porque MockMvc no sigue
 * las redirecciones de error del contenedor.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(OutputCaptureExtension.class)
@Import({ TestcontainersConfiguration.class, TestData.class, AbstractProblemErrorTest.ThrowingFilter.class })
abstract class AbstractProblemErrorTest {

	private static final Set<String> PROBLEM_FIELDS = Set.of("type", "title", "status", "detail", "instance");

	/** Falla antes de la cadena de seguridad cuando la petición lo pide: lo que ninguna advice de controlador ve. */
	@TestConfiguration(proxyBeanMethods = false)
	static class ThrowingFilter {

		@Bean
		FilterRegistrationBean<Filter> boom() {
			FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>((request, response, chain) -> {
				if (((jakarta.servlet.http.HttpServletRequest) request).getHeader("X-Boom") != null) {
					throw new IllegalStateException("detalle-interno-que-no-debe-salir");
				}
				chain.doFilter(request, response);
			});
			registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
			return registration;
		}

	}

	@LocalServerPort
	private int port;

	@Autowired
	protected TestData data;

	@Autowired
	private JsonMapper json;

	private final HttpClient client = HttpClient.newHttpClient();

	@ParameterizedTest
	@ValueSource(strings = { "text/html", "*/*" })
	void aRequestTheFirewallRejectsIsAProblem(String accept) throws Exception {
		// «;» en la ruta: StrictHttpFirewall lo rechaza antes de cualquier filtro con sendError(400).
		HttpResponse<String> response = get("/api/tickets;x=1", accept);

		JsonNode problem = problem(response, 400);
		assertThat(problem.get("title").asString()).isEqualTo("Petición no válida");
	}

	@ParameterizedTest
	@ValueSource(strings = { "text/html", "*/*" })
	void anExceptionFromAFilterIsA500ProblemThatLeaksNothingAndIsLogged(String accept, CapturedOutput output)
			throws Exception {
		HttpResponse<String> response = get("/api/me", accept, "X-Boom", "1");

		JsonNode problem = problem(response, 500);
		assertThat(problem.get("title").asString()).isEqualTo("Error interno");
		assertThat(problem.get("instance").asString()).isEqualTo("/api/me");
		assertThat(response.body()).doesNotContain("detalle-interno-que-no-debe-salir")
			.doesNotContain("IllegalStateException")
			.doesNotContain("trace");
		// El 5xx queda en el registro con la misma URI que ve el cliente.
		assertThat(output.getAll()).contains("Request failed with status 500 on /api/me");
	}

	protected HttpResponse<String> get(String path, String accept, String... headers) throws IOException,
			InterruptedException {
		return send("GET", path, accept, headers);
	}

	protected HttpResponse<String> send(String method, String path, String accept, String... headers)
			throws IOException, InterruptedException {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + this.port + path))
			.method(method, HttpRequest.BodyPublishers.noBody())
			.header("Accept", accept);
		if (headers.length > 0) {
			request.header(headers[0], headers[1]);
		}
		return this.client.send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	protected JsonNode problem(HttpResponse<String> response, int status) {
		assertThat(response.statusCode()).isEqualTo(status);
		assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
				(type) -> assertThat(type).startsWith("application/problem+json"));
		JsonNode body = this.json.readTree(response.body());
		assertThat(body.propertyNames()).isSubsetOf(PROBLEM_FIELDS).contains("title", "status", "detail", "instance");
		assertThat(body.get("status").asInt()).isEqualTo(status);
		// Spring omite el «type» cuando es el por defecto, about:blank; el 401 de la seguridad lo escribe.
		assertThat(body.has("type") ? body.get("type").asString() : "about:blank").isEqualTo("about:blank");
		return body;
	}

}
