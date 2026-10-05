package com.resolve.api.organizations;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Ajustes de la organización: lectura del personal, edición de administradores y efecto en métricas e informes. */
class OrganizationApiTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	private static final String LAURA = "laura@acme.example";

	private static final String MARIA = "maria@cliente.example";

	private static final String NORTHWIND_ADMIN = "admin@northwind.example";

	private static final MediaType MERGE_PATCH = MediaType.parseMediaType("application/merge-patch+json");

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private UUID acme;

	private UUID northwind;

	private UUID mariaCustomer;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.data.customerUser(this.acme, this.mariaCustomer, "María Pérez", MARIA);
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.data.staff(this.northwind, "admin", "Jordi Puig", NORTHWIND_ADMIN);
	}

	// --- Lectura y edición ---------------------------------------------------------------------------------------

	@Test
	void getsAndPatchesTheOrganizationWithIfMatch() throws Exception {
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getOrganization"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.name").value("Acme Studio"))
			.andExpect(jsonPath("$.supportEmail").isEmpty())
			.andExpect(jsonPath("$.timeZone").value("America/Bogota"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30))
			.andExpect(jsonPath("$.version").value(0));

		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", """
				{"name": "  Acme Soporte ", "supportEmail": " ayuda@acme.example ", "timeZone": "America/Mexico_City",
				 "firstResponseTargetMinutes": 45}"""))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateOrganization"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.name").value("Acme Soporte"))
			.andExpect(jsonPath("$.supportEmail").value("ayuda@acme.example"))
			.andExpect(jsonPath("$.timeZone").value("America/Mexico_City"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(45))
			.andExpect(jsonPath("$.version").value(1));

		// Lo escrito se lee igual, también por /me, y la organización ajena no cambió.
		this.mvc.perform(get("/organization").with(as(LAURA)))
			.andExpect(matchesContract("getOrganization"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.name").value("Acme Soporte"));
		this.mvc.perform(get("/me").with(as(MARIA)))
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.name").value("Acme Soporte"))
			.andExpect(jsonPath("$.organization.supportEmail").value("ayuda@acme.example"))
			.andExpect(jsonPath("$.organization.timeZone").value("America/Mexico_City"));
		this.mvc.perform(get("/organization").with(as(NORTHWIND_ADMIN)))
			.andExpect(jsonPath("$.name").value("Northwind Soporte"))
			.andExpect(jsonPath("$.timeZone").value("Europe/Madrid"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aPatchOnlyChangesTheFieldsItSends() throws Exception {
		patchOk(ADMIN, "\"0\"", "{\"firstResponseTargetMinutes\": 15}");
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(jsonPath("$.name").value("Acme Studio"))
			.andExpect(jsonPath("$.timeZone").value("America/Bogota"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(15));
	}

	@Test
	void aPatchThatChangesNothingKeepsTheVersion() throws Exception {
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", """
				{"name": "Acme Studio", "timeZone": "America/Bogota", "firstResponseTargetMinutes": 30}"""))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateOrganization"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void anEmptyOrNullSupportEmailClearsIt() throws Exception {
		patchOk(ADMIN, "\"0\"", "{\"supportEmail\": \"ayuda@acme.example\"}");
		this.mvc.perform(patchOrganization(ADMIN, "\"1\"", "{\"supportEmail\": \"  \"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.supportEmail").isEmpty())
			.andExpect(jsonPath("$.version").value(2));
		patchOk(ADMIN, "\"2\"", "{\"supportEmail\": \"otra@acme.example\"}");
		this.mvc.perform(patchOrganization(ADMIN, "\"3\"", "{\"supportEmail\": null}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateOrganization"))
			.andExpect(jsonPath("$.supportEmail").isEmpty())
			.andExpect(jsonPath("$.version").value(4));
	}

	@Test
	void theTicketCounterDoesNotChangeTheVersion() throws Exception {
		MvcResult read = this.mvc.perform(get("/organization").with(as(ADMIN))).andReturn();
		String etag = read.getResponse().getHeader("ETag");
		assertThat(etag).isEqualTo("\"0\"");

		// Dos tickets entre la lectura y el PATCH: el contador avanza, la versión no.
		createTicket(ADMIN, "Primero");
		createTicket(ADMIN, "Segundo");

		this.mvc.perform(patchOrganization(ADMIN, etag, "{\"name\": \"Acme Renombrada\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.version").value(1));
		// Y el PATCH no pisó el contador: el siguiente ticket es el tercero.
		assertThat(createTicket(ADMIN, "Tercero").path("number").asInt()).isEqualTo(3);
	}

	// --- Control de versión --------------------------------------------------------------------------------------

	@Test
	void requiresIfMatchAndRejectsAStaleVersion() throws Exception {
		this.mvc.perform(patch("/organization").with(as(ADMIN)).contentType(MERGE_PATCH).content("{\"name\": \"X\"}"))
			.andExpect(status().isPreconditionRequired())
			.andExpect(matchesContract("updateOrganization"));
		patchOk(ADMIN, "\"0\"", "{\"name\": \"Primera\"}");
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{\"name\": \"Segunda\"}"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(matchesContract("updateOrganization"));
		this.mvc.perform(patchOrganization(ADMIN, "W/\"1\"", "{\"name\": \"Débil\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateOrganization"))
			.andExpect(jsonPath("$.errors[0].field").value("If-Match"));
		this.mvc.perform(get("/organization").with(as(ADMIN))).andExpect(jsonPath("$.name").value("Primera"));
	}

	@Test
	void validationComesBeforeThePreconditionCheckLikeTheOtherResources() throws Exception {
		// Orden del contrato: 428, 400 y después 412. Una versión vieja con un cuerpo inválido es un 400.
		patchOk(ADMIN, "\"0\"", "{\"name\": \"Primera\"}");
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{\"firstResponseTargetMinutes\": 0}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("firstResponseTargetMinutes"));
	}

	// --- Validación ----------------------------------------------------------------------------------------------

	@Test
	void rejectsAnUnknownTimeZoneWithAFieldError() throws Exception {
		// Desconocida, offsets, alias que Java acepta y PostgreSQL interpreta distinto, y otra capitalización. Las
		// capas de validación se tapan entre sí (OrganizationRequestParserTest fija la de Java por separado);
		// «SystemV/EST5» es una región exacta para Java y solo la rechaza la consulta a pg_timezone_names.
		for (String zone : new String[] { "Mars/Olympus", "+05:00", "Z", "UTC+5", "GMT+5", "america/bogota", "EST", "",
				"SystemV/EST5" }) {
			this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{\"timeZone\": \"%s\"}".formatted(zone)))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("updateOrganization"))
				.andExpect(jsonPath("$.errors[0].field").value("timeZone"));
		}
		for (String body : new String[] { "{\"timeZone\": null}", "{\"timeZone\": 5}" }) {
			this.mvc.perform(patchOrganization(ADMIN, "\"0\"", body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value("timeZone"));
		}
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(jsonPath("$.timeZone").value("America/Bogota"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void acceptsRegionsThatBothJavaAndPostgreSqlKnow() throws Exception {
		for (String zone : new String[] { "UTC", "Europe/Madrid", "Pacific/Kiritimati" }) {
			String version = this.mvc.perform(get("/organization").with(as(ADMIN)))
				.andReturn()
				.getResponse()
				.getHeader("ETag");
			this.mvc.perform(patchOrganization(ADMIN, version, "{\"timeZone\": \"%s\"}".formatted(zone)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.timeZone").value(zone));
		}
	}

	@Test
	void rejectsInvalidValuesAndReportsEveryField() throws Exception {
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", """
				{"name": "%s", "supportEmail": "no-es-un-correo", "timeZone": "Mars/Olympus",
				 "firstResponseTargetMinutes": 1441}""".formatted("N".repeat(121))))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateOrganization"))
			.andExpect(jsonPath("$.errors[*].field",
					containsInAnyOrder("name", "supportEmail", "timeZone", "firstResponseTargetMinutes")));
	}

	@Test
	void rejectsBadTypesBlankNamesAndControlCharacters() throws Exception {
		String[][] cases = { { "name", "null" }, { "name", "\"   \"" }, { "name", "7" }, { "name", "\"Acme\\u0000\"" },
				{ "supportEmail", "7" }, { "supportEmail", "\"a\\u0000@b.co\"" }, { "supportEmail", "[\"a@b.co\"]" },
				{ "firstResponseTargetMinutes", "0" }, { "firstResponseTargetMinutes", "1441" },
				{ "firstResponseTargetMinutes", "30.5" }, { "firstResponseTargetMinutes", "\"30\"" },
				{ "firstResponseTargetMinutes", "null" } };
		for (String[] testCase : cases) {
			this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{\"%s\": %s}".formatted(testCase[0], testCase[1])))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value(testCase[0]));
		}
		// Los límites exactos sí se aceptan.
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{\"firstResponseTargetMinutes\": 1}"))
			.andExpect(status().isOk());
		this.mvc.perform(patchOrganization(ADMIN, "\"1\"", "{\"firstResponseTargetMinutes\": 1440}"))
			.andExpect(status().isOk());
	}

	@Test
	void rejectsAnEmptyBodyAndFieldsThatAreNotSettings() throws Exception {
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", "{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("body"));
		this.mvc.perform(patchOrganization(ADMIN, "\"0\"", """
				{"name": "Intruso", "id": "%s", "version": 9, "nextTicketNumber": 500}""".formatted(this.northwind)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("id", "version", "nextTicketNumber")));
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(jsonPath("$.name").value("Acme Studio"))
			.andExpect(jsonPath("$.version").value(0));
	}

	// --- Permisos ------------------------------------------------------------------------------------------------

	@Test
	void anAgentCanReadButNotPatchTheOrganization() throws Exception {
		this.mvc.perform(get("/organization").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getOrganization"));
		// El 403 llega antes de leer la versión o el cuerpo: sin If-Match y con un cuerpo inválido sigue siendo 403.
		this.mvc.perform(patch("/organization").with(as(LAURA)).contentType(MERGE_PATCH).content("{}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("updateOrganization"));
		this.mvc.perform(patchOrganization(LAURA, "\"0\"", "{\"name\": \"Hackeada\"}"))
			.andExpect(status().isForbidden());
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(jsonPath("$.name").value("Acme Studio"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aCustomerCannotReadNorPatchTheOrganization() throws Exception {
		this.mvc.perform(get("/organization").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getOrganization"));
		this.mvc.perform(patchOrganization(MARIA, "\"0\"", "{\"name\": \"Hackeada\"}"))
			.andExpect(status().isForbidden());
	}

	@Test
	void withoutAPrincipalTheOrganizationIs401() throws Exception {
		this.mvc.perform(get("/organization")).andExpect(status().isUnauthorized()).andExpect(matchesContract("getOrganization"));
		this.mvc.perform(patch("/organization").contentType(MERGE_PATCH).content("{\"name\": \"X\"}"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("updateOrganization"));
	}

	@Test
	void anAdminOnlyChangesTheirOwnOrganization() throws Exception {
		patchOk(NORTHWIND_ADMIN, "\"0\"", "{\"name\": \"Northwind Renombrada\", \"firstResponseTargetMinutes\": 5}");
		this.mvc.perform(get("/organization").with(as(ADMIN)))
			.andExpect(jsonPath("$.name").value("Acme Studio"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30))
			.andExpect(jsonPath("$.version").value(0));
	}

	// --- Efecto en métricas e informes ---------------------------------------------------------------------------

	@Test
	void changingTheTargetChangesTicketMetrics() throws Exception {
		this.mvc.perform(get("/tickets/metrics").with(as(LAURA)))
			.andExpect(matchesContract("getTicketMetrics"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30));
		patchOk(ADMIN, "\"0\"", "{\"firstResponseTargetMinutes\": 12}");
		this.mvc.perform(get("/tickets/metrics").with(as(LAURA)))
			.andExpect(matchesContract("getTicketMetrics"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(12));
		this.mvc.perform(get("/members/metrics").with(as(LAURA)))
			.andExpect(matchesContract("getTeamMetrics"))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(12));
	}

	@Test
	void changingTheTargetChangesTheReportTarget() throws Exception {
		this.mvc.perform(get("/reports/summary").with(as(LAURA)))
			.andExpect(matchesContract("getReportSummary"))
			.andExpect(jsonPath("$.firstResponseMinutes.target").value(30));
		patchOk(ADMIN, "\"0\"", "{\"firstResponseTargetMinutes\": 90}");
		this.mvc.perform(get("/reports/summary").with(as(LAURA)))
			.andExpect(matchesContract("getReportSummary"))
			.andExpect(jsonPath("$.firstResponseMinutes.target").value(90));
	}

	@Test
	void changingTheTimeZoneChangesThePeriodAndTheDays() throws Exception {
		// El reloj de los tests está en 2026-10-04T15:00Z: en Bogotá es el 4, en Kiritimati (UTC+14) ya es el 5.
		this.data.ticket(this.acme, this.mariaCustomer, 1, "open", "web", java.time.Instant.parse("2026-10-04T15:00:00Z"));

		MvcResult before = this.mvc.perform(get("/reports/summary").with(as(LAURA)))
			.andExpect(matchesContract("getReportSummary"))
			.andReturn();
		JsonNode bogota = JSON.readTree(before.getResponse().getContentAsString());
		assertThat(bogota.at("/period/timeZone").asString()).isEqualTo("America/Bogota");
		assertThat(bogota.at("/period/from").asString()).isEqualTo("2026-09-28T05:00:00Z");
		assertThat(bogota.path("byDay").get(6).path("date").asString()).isEqualTo("2026-10-04");
		assertThat(bogota.path("byDay").get(6).path("created").asInt()).isEqualTo(1);

		patchOk(ADMIN, "\"0\"", "{\"timeZone\": \"Pacific/Kiritimati\"}");

		MvcResult after = this.mvc.perform(get("/reports/summary").with(as(LAURA)))
			.andExpect(matchesContract("getReportSummary"))
			.andReturn();
		JsonNode kiritimati = JSON.readTree(after.getResponse().getContentAsString());
		assertThat(kiritimati.at("/period/timeZone").asString()).isEqualTo("Pacific/Kiritimati");
		assertThat(kiritimati.at("/period/from").asString()).isEqualTo("2026-09-28T10:00:00Z");
		assertThat(kiritimati.path("byDay").get(6).path("date").asString()).isEqualTo("2026-10-05");
		assertThat(kiritimati.path("byDay").get(6).path("created").asInt()).isEqualTo(1);
		assertThat(kiritimati.path("byDay").get(5).path("date").asString()).isEqualTo("2026-10-04");
		assertThat(kiritimati.path("byDay").get(5).path("created").asInt()).isZero();
	}

	// --- Ayudas --------------------------------------------------------------------------------------------------

	private static MockHttpServletRequestBuilder patchOrganization(String user, String ifMatch, String body) {
		return patch("/organization").with(as(user)).contentType(MERGE_PATCH).header("If-Match", ifMatch).content(body);
	}

	private void patchOk(String user, String ifMatch, String body) throws Exception {
		this.mvc.perform(patchOrganization(user, ifMatch, body)).andExpect(status().isOk());
	}

	private JsonNode createTicket(String user, String subject) throws Exception {
		MvcResult result = this.mvc
			.perform(post("/tickets").with(as(user))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"customerId": "%s", "subject": "%s", "description": "Detalle", "priority": "low"}"""
					.formatted(this.mariaCustomer, subject)))
			.andExpect(status().isCreated())
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

}
