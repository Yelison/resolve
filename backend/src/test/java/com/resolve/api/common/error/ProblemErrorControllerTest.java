package com.resolve.api.common.error;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** {@link AbstractProblemErrorTest} con la cadena de demostración (cabecera {@code X-Demo-User}), y sus casos propios. */
@ActiveProfiles("test")
class ProblemErrorControllerTest extends AbstractProblemErrorTest {

	@BeforeEach
	void seed() {
		this.data.reset();
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
	}

	@ParameterizedTest
	@ValueSource(strings = { "text/html", "*/*", "application/json", "text/html,application/xhtml+xml" })
	void aRouteOfTheApiWithoutAHandlerIsAProblemWhateverTheBrowserAccepts(String accept) throws Exception {
		HttpResponse<String> response = get("/api/nada/de/nada", accept, "X-Demo-User", "laura@acme.example");

		JsonNode problem = problem(response, 404);
		assertThat(problem.get("title").asString()).isEqualTo("No encontrado");
		assertThat(problem.get("instance").asString()).isEqualTo("/api/nada/de/nada");
	}

	@ParameterizedTest
	@ValueSource(strings = { "text/html", "*/*" })
	void aWrongMethodIsASpanishProblemThatKeepsTheAllowHeader(String accept) throws Exception {
		HttpResponse<String> response = send("POST", "/api/me", accept, "X-Demo-User", "laura@acme.example");

		JsonNode problem = problem(response, 405);
		assertThat(problem.get("title").asString()).isEqualTo("Método no permitido");
		assertThat(problem.get("detail").asString()).isEqualTo("Esta ruta no admite ese método.");
		assertThat(response.headers().firstValue("Allow")).hasValueSatisfying((allow) -> assertThat(allow).contains("GET"));
	}

	@Test
	void theErrorRouteItselfIsClosedToAnonymousAndNotFoundForStaff() throws Exception {
		// Un anónimo recibe el 401 de siempre; el personal, que llega sin error de por medio, un 404 Problem y no el
		// JSON de Spring Boot.
		problem(get("/api/error", "text/html"), 401);
		problem(get("/api/error", "text/html", "X-Demo-User", "laura@acme.example"), 404);
	}

}
