package com.resolve.api.common.security;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La organización que la pantalla muestra, en {@code X-Organization-Id}, contra la de la sesión (issue #60), con la
 * cadena de {@code dev}/{@code test}. Que todas las escrituras del contrato la comprueban lo prueba
 * {@code ApiAccessMatrixTest}; aquí, el comportamiento y que un 409 no deja efecto.
 */
class OrganizationHeaderTest extends ApiIntegrationTest {

	private static final String ADMIN = "ana@acme.example";

	private static final String CLARA = "clara@cliente.example";

	private static final String MISMATCH = "https://resolve.example/problems/organization-mismatch";

	private UUID acme;

	private UUID northwind;

	private UUID customer;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		UUID ana = this.data.staff(this.acme, "admin", "Ana", ADMIN);
		this.data.membership(this.northwind, ana, "agent", "active");
		this.customer = this.data.customer(this.acme, "Clara", CLARA, "Cliente SA");
		this.data.customerUser(this.acme, this.customer, "Clara", CLARA);
	}

	private String newTicket() {
		return "{\"customerId\":\"" + this.customer + "\",\"subject\":\"Asunto\",\"description\":\"Detalle\"}";
	}

	private void assertTickets(int total) throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(ADMIN))).andExpect(jsonPath("$.totalItems").value(total));
	}

	@Test
	void aWriteForAnotherOrganizationAnswers409AndCreatesNothing() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN))
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isConflict())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.type").value(MISMATCH))
			.andExpect(jsonPath("$.status").value(409))
			.andExpect(jsonPath("$.instance").value(API + "/tickets"));

		assertTickets(0);
	}

	@Test
	void aMismatchedUpdateWithAValidIfMatchChangesNothingAndDoesNotBumpTheVersion() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(newTicket()))
			.andExpect(status().isCreated());

		this.mvc.perform(patch(API + "/tickets/1").with(as(ADMIN))
			.header("X-Organization-Id", this.northwind.toString())
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"status\":\"resolved\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("updateTicket"))
			.andExpect(jsonPath("$.type").value(MISMATCH));

		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN)))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.status").value("open"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aMismatchedArchiveDoesNotArchiveTheCustomer() throws Exception {
		this.mvc.perform(post(API + "/customers/" + this.customer + "/archive").with(as(ADMIN))
			.header("X-Organization-Id", this.northwind.toString()))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("archiveCustomer"))
			.andExpect(jsonPath("$.type").value(MISMATCH));

		this.mvc.perform(get(API + "/customers/" + this.customer).with(as(ADMIN)))
			.andExpect(jsonPath("$.archived").value(false));
	}

	@Test
	void anOrganizationThatDoesNotExistIsTheSame409() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN))
			.header("X-Organization-Id", UUID.randomUUID().toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.type").value(MISMATCH));
	}

	@Test
	void theHeaderOfTheSessionOrganizationLetsTheWriteThrough() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN))
			.header("X-Organization-Id", this.acme.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createTicket"));

		assertTickets(1);
	}

	@Test
	void theHeaderIsOptionalAndCaseAndSpacesOfTheUuidDoNotMatter() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(newTicket()))
			.andExpect(status().isCreated());
		this.mvc.perform(post(API + "/tickets").with(as(ADMIN))
			.header("X-Organization-Id", " " + this.acme.toString().toUpperCase() + " ")
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isCreated());

		assertTickets(2);
	}

	@Test
	void aMalformedValueIsA400AndNothingIsWritten() throws Exception {
		for (String value : new String[] { "", "no-es-un-uuid", "1-2-3-4-5", this.acme + "x" }) {
			this.mvc.perform(post(API + "/tickets").with(as(ADMIN))
				.header("X-Organization-Id", value)
				.contentType(MediaType.APPLICATION_JSON)
				.content(newTicket()))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("createTicket"))
				.andExpect(jsonPath("$.type").value("about:blank"))
				.andExpect(jsonPath("$.detail").value("La cabecera X-Organization-Id no es un identificador válido."));
		}

		assertTickets(0);
	}

	@Test
	void readsIgnoreTheHeader() throws Exception {
		this.mvc.perform(get(API + "/me").with(as(ADMIN)).header("X-Organization-Id", this.northwind.toString()))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void choosingTheOrganizationIgnoresTheHeader() throws Exception {
		// La cabecera no es la de la sesión (Acme) ni la elegida: sin la excepción sería un 409 por ser la de «antes».
		this.mvc.perform(post(API + "/session/organization").with(as(ADMIN))
			.header("X-Organization-Id", UUID.randomUUID().toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + this.northwind + "\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("selectSessionOrganization"))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()));
	}

	@Test
	void afterSwitchingOrganizationTheOldOneIsTheMismatchAndTheNewOneThePass() throws Exception {
		// La carrera entre pestañas: la pantalla sigue en Acme mientras la sesión ya está en Northwind.
		MockHttpSession session = new MockHttpSession();
		this.mvc.perform(post(API + "/session/organization").session(session)
			.with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + this.northwind + "\"}"))
			.andExpect(status().isOk());

		this.mvc.perform(patch(API + "/me").session(session)
			.with(as(ADMIN))
			.header("X-Organization-Id", this.acme.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Ana Nueva\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.type").value(MISMATCH));
		this.mvc.perform(get(API + "/me").session(session).with(as(ADMIN))).andExpect(jsonPath("$.user.name").value("Ana"));

		this.mvc.perform(patch(API + "/me").session(session)
			.with(as(ADMIN))
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Ana Nueva\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Ana Nueva"));
	}

	@Test
	void aStaleOrganizationWinsOverTheRoleThatWouldHaveBeenForbidden() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(CLARA))
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.type").value(MISMATCH));
		this.mvc.perform(post(API + "/tickets").with(as(CLARA))
			.header("X-Organization-Id", this.acme.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isForbidden());
	}

	@Test
	void withoutAPrincipalTheAnswerIsStillA401() throws Exception {
		this.mvc.perform(post(API + "/tickets").header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(newTicket()))
			.andExpect(status().isUnauthorized());
	}

}
