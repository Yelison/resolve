package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Edición del propio nombre: cualquier rol, solo el nombre, y reflejado en todo lo que muestra a esa persona. */
class ProfileApiTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	private static final String LAURA = "laura@acme.example";

	private static final String MARIA = "maria@cliente.example";

	private UUID acme;

	private UUID laura;

	private UUID mariaCustomer;

	private UUID ticket;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.data.customerUser(this.acme, this.mariaCustomer, "María Pérez", MARIA);
		this.ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "open", "email",
				Instant.parse("2026-10-03T12:00:00Z"));
		this.data.assignTicket(this.ticket, this.laura);
	}

	@Test
	void patchingMyNameReflectsInMeAndMemberRefs() throws Exception {
		// Antes del cambio: actividad y mensaje con el nombre de entonces.
		this.data.changeStatus(this.acme, this.ticket, this.laura, "Laura Méndez", "resolved",
				Instant.parse("2026-10-03T13:00:00Z"));
		this.data.agentMessage(this.acme, this.ticket, this.laura, "public", Instant.parse("2026-10-03T12:30:00Z"));

		rename(LAURA, "{\"name\": \"  Laura Méndez-Ríos \"}").andExpect(status().isOk())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.user.name").value("Laura Méndez-Ríos"))
			.andExpect(jsonPath("$.user.email").value(LAURA))
			.andExpect(jsonPath("$.role").value("agent"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));

		this.mvc.perform(get("/me").with(as(LAURA)))
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.user.name").value("Laura Méndez-Ríos"));
		// El responsable del ticket, los mensajes, el equipo, los asignables y el informe usan el nombre vivo.
		this.mvc.perform(get("/tickets/1").with(as(ADMIN)))
			.andExpect(matchesContract("getTicket"))
			.andExpect(jsonPath("$.assignee.name").value("Laura Méndez-Ríos"));
		this.mvc.perform(get("/tickets/1/messages").with(as(ADMIN)))
			.andExpect(matchesContract("listMessages"))
			.andExpect(jsonPath("$[0].author.name").value("Laura Méndez-Ríos"));
		this.mvc.perform(get("/members").with(as(ADMIN)))
			.andExpect(matchesContract("listMembers"))
			.andExpect(jsonPath("$[*].name", containsInAnyOrder("Laura Méndez-Ríos", "Yelisson Ortiz")));
		this.mvc.perform(get("/assignees").with(as(ADMIN)))
			.andExpect(matchesContract("listAssignees"))
			.andExpect(jsonPath("$[*].name", contains("Laura Méndez-Ríos", "Yelisson Ortiz")));
		this.clock.set(Instant.parse("2026-10-04T15:00:00Z"));
		this.mvc.perform(get("/reports/summary").with(as(ADMIN)))
			.andExpect(matchesContract("getReportSummary"))
			.andExpect(jsonPath("$.byAgent[?(@.member.name == 'Laura Méndez-Ríos')].resolved").value(contains(1)))
			.andExpect(jsonPath("$.byAgent[?(@.member.name == 'Laura Méndez')]").isEmpty());
		// El historial conserva el nombre de entonces (docs/plans §3.9: «history keeps the old name»).
		this.mvc.perform(get("/tickets/1/activity").with(as(ADMIN)))
			.andExpect(matchesContract("listActivity"))
			.andExpect(jsonPath("$[0].actor.name").value("Laura Méndez"));
		this.mvc.perform(get("/tickets/activity").with(as(ADMIN)))
			.andExpect(matchesContract("listRecentActivity"))
			.andExpect(jsonPath("$[0].activity.actor.name").value("Laura Méndez"));
	}

	@Test
	void aCustomerCanOnlyPatchItsOwnName() throws Exception {
		rename(MARIA, "{\"name\": \"María P. Soler\"}").andExpect(status().isOk())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.user.name").value("María P. Soler"))
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(this.mariaCustomer.toString()));

		// Cambió la persona que inicia sesión, no la ficha de cliente que gestiona el personal ni a nadie más.
		this.mvc.perform(get("/customers/" + this.mariaCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.name").value("María Pérez"))
			.andExpect(jsonPath("$.version").value(0));
		this.mvc.perform(get("/me").with(as(LAURA))).andExpect(jsonPath("$.user.name").value("Laura Méndez"));
		this.mvc.perform(get("/me").with(as(ADMIN))).andExpect(jsonPath("$.user.name").value("Yelisson Ortiz"));

		// Nada más que el nombre: ni correo, ni rol, ni la ficha, ni la organización.
		rename(MARIA, """
				{"name": "Otra", "email": "otra@cliente.example", "role": "admin", "customerId": "%s",
				 "organizationId": "%s", "id": "%s"}""".formatted(this.mariaCustomer, this.acme, this.laura))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.errors[*].field",
					containsInAnyOrder("email", "role", "customerId", "organizationId", "id")));
		this.mvc.perform(get("/me").with(as(MARIA)))
			.andExpect(jsonPath("$.user.name").value("María P. Soler"))
			.andExpect(jsonPath("$.user.email").value(MARIA))
			.andExpect(jsonPath("$.role").value("customer"));
	}

	@Test
	void everyRoleCanRenameWithoutIfMatch() throws Exception {
		rename(ADMIN, "{\"name\": \"Yelisson O.\"}").andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Yelisson O."))
			.andExpect(jsonPath("$.role").value("admin"));
		rename(LAURA, "{\"name\": \"Laura M.\"}").andExpect(status().isOk());
		// Un cambio repetido es idempotente.
		rename(LAURA, "{\"name\": \"Laura M.\"}").andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Laura M."));
	}

	@Test
	void rejectsAnInvalidNameWithAFieldError() throws Exception {
		for (String name : new String[] { "null", "\"   \"", "\"\"", "7", "[\"a\"]", "\"Ana\\u0000\"",
				"\"" + "N".repeat(121) + "\"" }) {
			rename(LAURA, "{\"name\": %s}".formatted(name)).andExpect(status().isBadRequest())
				.andExpect(matchesContract("updateMe"))
				.andExpect(jsonPath("$.errors[0].field").value("name"));
		}
		rename(LAURA, "{}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("name"));
		rename(LAURA, "[]").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("body"));
		rename(LAURA, "{\"name\": \"%s\"}".formatted("N".repeat(120))).andExpect(status().isOk());
	}

	@Test
	void withoutAPrincipalPatchingMeIs401() throws Exception {
		this.mvc.perform(patch("/me").contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"X\"}"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("updateMe"));
	}

	private ResultActions rename(String user, String body) throws Exception {
		return this.mvc.perform(patch("/me").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(body));
	}

}
