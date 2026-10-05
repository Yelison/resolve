package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Lectura del equipo, invitaciones, métricas, permisos por rol y aislamiento entre organizaciones. */
class MembersApiTest extends TeamFixture {

	// --- Leer ---------------------------------------------------------------------------------------------------

	@Test
	void listsTheTeamWithStatusAndOpenTicketCounts() throws Exception {
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 1, "open"), this.laura);
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 2, "in_progress"), this.laura);
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 3, "resolved"), this.laura);
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 4, "waiting"), this.daniel);

		MvcResult result = this.mvc.perform(get(API + "/members").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listMembers"))
			// Por nombre sin distinguir mayúsculas; los invitados y retirados aparecen, la clienta no.
			.andExpect(jsonPath("$[*].name",
					contains("Daniel Santos", "Inés Invitada", "Laura Méndez", "Raúl Retirado", "Yelisson Ortiz")))
			.andReturn();

		JsonNode team = body(result);
		assertThat(member(team, LAURA).path("openTickets").asInt()).isEqualTo(2);
		assertThat(member(team, LAURA).path("role").asString()).isEqualTo("agent");
		assertThat(member(team, LAURA).path("id").asString()).isEqualTo(this.laura.toString());
		assertThat(member(team, DANIEL).path("openTickets").asInt()).isEqualTo(1);
		assertThat(member(team, ADMIN).path("openTickets").asInt()).isZero();
		assertThat(member(team, INVITED).path("status").asString()).isEqualTo("invited");
		assertThat(member(team, INVITED).path("joinedAt").isNull()).isTrue();
		assertThat(member(team, INVITED).path("invitedAt").isNull()).isFalse();
		assertThat(member(team, REMOVED).path("status").asString()).isEqualTo("removed");
	}

	private static JsonNode member(JsonNode team, String email) {
		for (JsonNode member : team) {
			if (email.equals(member.path("email").asString())) {
				return member;
			}
		}
		throw new AssertionError("No aparece " + email + " en el equipo");
	}

	@Test
	void teamMetricsCountStaffLoadAndUnassigned() throws Exception {
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 1, "open"), this.laura);
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 2, "in_progress"), this.daniel);
		this.data.ticket(this.acme, this.mariaCustomer, 3, "open");
		this.data.ticket(this.acme, this.mariaCustomer, 4, "waiting");
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 5, "resolved"), this.laura);
		this.data.ticket(this.acme, this.mariaCustomer, 6, "resolved");
		// Respuestas a los 10 y 20 minutos de abrirse: la mediana redondeada es 15.
		this.data.respondAfter(this.data.ticket(this.acme, this.mariaCustomer, 7, "resolved"), 10);
		this.data.respondAfter(this.data.ticket(this.acme, this.mariaCustomer, 8, "resolved"), 20);
		// Otra organización no cuenta.
		this.data.ticket(this.northwind, this.data.customer(this.northwind, "Marta", "marta@soler.example", null), 1, "open");

		// staff = admin + 2 agentes activos (ni la invitada ni el retirado); 2 asignados / 3 = 0,67 → 0,7.
		this.mvc.perform(get(API + "/members/metrics").with(as(DANIEL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getTeamMetrics"))
			.andExpect(jsonPath("$.staff").value(3))
			.andExpect(jsonPath("$.assignedOpen").value(2))
			.andExpect(jsonPath("$.unassignedOpen").value(2))
			.andExpect(jsonPath("$.averageLoad").value(0.7))
			.andExpect(jsonPath("$.firstResponseMinutes").value(15))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30));
		// La primera respuesta es la misma cifra que las métricas de tickets.
		this.mvc.perform(get(API + "/tickets/metrics").with(as(DANIEL)))
			.andExpect(jsonPath("$.firstResponseMinutes").value(15))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30));
	}

	@Test
	void teamMetricsWithoutDataAreZeroAndNull() throws Exception {
		this.mvc.perform(get(API + "/members/metrics").with(as(NORTHWIND_ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getTeamMetrics"))
			.andExpect(jsonPath("$.staff").value(2))
			.andExpect(jsonPath("$.assignedOpen").value(0))
			.andExpect(jsonPath("$.unassignedOpen").value(0))
			.andExpect(jsonPath("$.averageLoad").value(0.0))
			.andExpect(jsonPath("$.firstResponseMinutes").isEmpty());
	}

	// --- Invitar ------------------------------------------------------------------------------------------------

	@Test
	void invitesANewMemberAsInvited() throws Exception {
		MvcResult result = invite(ADMIN, """
				{"email": "sofia.rios@acme.example", "name": "Sofía Ríos", "role": "agent"}
				""");
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		this.mvc.perform(post(API + "/members").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"otra@acme.example\", \"role\": \"admin\"}"))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("inviteMember"))
			.andExpect(jsonPath("$.name").value("otra"))
			.andExpect(jsonPath("$.role").value("admin"))
			.andExpect(jsonPath("$.status").value("invited"))
			.andExpect(jsonPath("$.openTickets").value(0))
			.andExpect(jsonPath("$.joinedAt").isEmpty())
			.andExpect(jsonPath("$.invitedAt").value(TestClockConfiguration.START.toString()));

		JsonNode member = body(result);
		assertThat(member.path("name").asString()).isEqualTo("Sofía Ríos");
		assertThat(member.path("status").asString()).isEqualTo("invited");
		UUID userId = UUID.fromString(member.path("id").asString());
		assertThat(this.data.membershipStatus(this.acme, userId)).isEqualTo("invited");
		// Sin cambios hasta que entre: no es asignable ni cuenta como equipo activo.
		this.mvc.perform(get(API + "/assignees").with(as(ADMIN)))
			.andExpect(jsonPath("$[*].email").value(org.hamcrest.Matchers.not(
					org.hamcrest.Matchers.hasItem("sofia.rios@acme.example"))));
	}

	@Test
	void anInvitedMemberThroughTheApiSignsInAndBecomesActive() throws Exception {
		JsonNode member = body(invite(ADMIN, "{\"email\": \"nueva@acme.example\", \"role\": \"agent\"}"));
		UUID userId = UUID.fromString(member.path("id").asString());

		this.mvc.perform(get(API + "/me").with(as("NUEVA@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("agent"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
		assertThat(this.data.membershipStatus(this.acme, userId)).isEqualTo("active");
		assertThat(listMembers(ADMIN).findValuesAsString("status")).contains("active");
	}

	@Test
	void reinvitingARemovedMemberReusesTheMembership() throws Exception {
		UUID membership = this.data.membershipId(this.acme, this.removed);
		MvcResult result = invite(ADMIN, "{\"email\": \"RETIRADO@acme.example\", \"role\": \"admin\"}");
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		this.mvc.perform(post(API + "/members").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"retirado@acme.example\", \"role\": \"agent\"}"))
			.andExpect(status().isBadRequest());

		JsonNode member = body(result);
		assertThat(member.path("id").asString()).isEqualTo(this.removed.toString());
		assertThat(member.path("status").asString()).isEqualTo("invited");
		assertThat(member.path("role").asString()).isEqualTo("admin");
		// El nombre del usuario existente no se renombra y la fila es la misma.
		assertThat(member.path("name").asString()).isEqualTo("Raúl Retirado");
		assertThat(this.data.membershipId(this.acme, this.removed)).isEqualTo(membership);
		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("invited");
		this.mvc.perform(get(API + "/me").with(as(REMOVED)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("admin"));
	}

	@Test
	void anExistingUserOfAnotherOrganizationIsInvitedWithoutBeingRenamed() throws Exception {
		JsonNode member = body(invite(ADMIN, """
				{"email": "agente@northwind.example", "name": "Otro Nombre", "role": "agent"}
				"""));
		assertThat(member.path("id").asString()).isEqualTo(this.northwindAgent.toString());
		assertThat(member.path("name").asString()).isEqualTo("Jordi Puig");
		assertThat(this.data.membershipStatus(this.acme, this.northwindAgent)).isEqualTo("invited");
		assertThat(this.data.membershipStatus(this.northwind, this.northwindAgent)).isEqualTo("active");
	}

	@Test
	void inviteRejectsExistingMembersAndCustomerEmails() throws Exception {
		this.data.customer(this.acme, "Cliente Archivado", "archivado@cliente.example", null);
		this.data.archiveCustomer(this.data.customerIdByEmail(this.acme, "archivado@cliente.example"),
				TestClockConfiguration.START);
		this.data.customer(this.acme, "Sin Acceso", "sinacceso@cliente.example", null);
		for (String[] rejected : new String[][] { { LAURA, "Ya forma parte del equipo." },
				{ "LAURA@ACME.EXAMPLE", "Ya forma parte del equipo." }, { INVITED, "Ya forma parte del equipo." },
				{ MARIA, "Este correo pertenece a un cliente." },
				{ "archivado@cliente.example", "Este correo pertenece a un cliente." },
				{ "SINACCESO@cliente.example", "Este correo pertenece a un cliente." } }) {
			this.mvc.perform(post(API + "/members").with(as(ADMIN))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\": \"%s\", \"role\": \"agent\"}".formatted(rejected[0])))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("inviteMember"))
				.andExpect(jsonPath("$.errors[0].field").value("email"))
				.andExpect(jsonPath("$.errors[0].message").value(rejected[1]));
		}
		// Nada cambió: la clienta sigue siendo clienta y la invitada sigue invitada.
		assertThat(this.data.membershipStatus(this.acme, this.mariaUser)).isEqualTo("active");
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("invited");
	}

	@Test
	void inviteValidatesTheBody() throws Exception {
		for (String[] invalid : new String[][] { { "{}", "email" }, { "{\"email\": \"nope\", \"role\": \"agent\"}", "email" },
				{ "{\"email\": \"a@b.example\"}", "role" }, { "{\"email\": \"a@b.example\", \"role\": \"customer\"}", "role" },
				{ "{\"email\": \"a@b.example\", \"role\": \"agent\", \"name\": \"\"}", "name" },
				{ "{\"email\": \"a@b.example\", \"role\": \"agent\", \"organizationId\": \"x\"}", "organizationId" },
				{ "{\"email\": null, \"role\": \"agent\"}", "email" } }) {
			this.mvc.perform(post(API + "/members").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(invalid[0]))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("inviteMember"))
				.andExpect(jsonPath("$.errors[*].field").value(org.hamcrest.Matchers.hasItem(invalid[1])));
		}
		this.mvc.perform(post(API + "/members").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("[]"))
			.andExpect(status().isBadRequest());
		assertThat(listMembers(ADMIN)).hasSize(5);
	}

	// --- Cambiar el rol -----------------------------------------------------------------------------------------

	@Test
	void changesTheRoleOfActiveAndInvitedMembers() throws Exception {
		this.mvc.perform(post(API + "/members/" + this.laura + "/role").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"admin\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("changeMemberRole"))
			.andExpect(jsonPath("$.role").value("admin"))
			.andExpect(jsonPath("$.status").value("active"));
		this.mvc.perform(get(API + "/me").with(as(LAURA))).andExpect(jsonPath("$.role").value("admin"));
		assertThat(body(changeRole(ADMIN, this.invited, "admin")).path("role").asString()).isEqualTo("admin");
		// Mismo rol: no hace nada y responde 200.
		assertThat(changeRole(ADMIN, this.daniel, "agent").getResponse().getStatus()).isEqualTo(200);
		assertThat(this.data.membershipStatus(this.acme, this.daniel)).isEqualTo("active");
	}

	@Test
	void changeRoleHidesUnknownForeignAndCustomerUsersAndValidates() throws Exception {
		for (UUID notATeamMember : new UUID[] { UUID.randomUUID(), this.northwindAdmin, this.mariaUser }) {
			this.mvc.perform(post(API + "/members/" + notATeamMember + "/role").with(as(ADMIN))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"role\": \"agent\"}"))
				.andExpect(status().isNotFound())
				.andExpect(matchesContract("changeMemberRole"));
		}
		assertThat(this.data.membershipStatus(this.northwind, this.northwindAdmin)).isEqualTo("active");
		// 404 antes que 400: el cuerpo inválido no se mira si el miembro no existe.
		this.mvc.perform(post(API + "/members/" + UUID.randomUUID() + "/role").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"customer\"}")).andExpect(status().isNotFound());
		for (String invalid : new String[] { "{\"role\": \"customer\"}", "{}", "{\"role\": \"agent\", \"x\": 1}" }) {
			this.mvc.perform(post(API + "/members/" + this.laura + "/role").with(as(ADMIN))
				.contentType(MediaType.APPLICATION_JSON)
				.content(invalid))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("changeMemberRole"));
		}
		this.mvc.perform(post(API + "/members/no-es-un-uuid/role").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"agent\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("userId"));
		// Un miembro retirado es un estado que no admite cambios: 409.
		this.mvc.perform(post(API + "/members/" + this.removed + "/role").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"admin\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("changeMemberRole"));
		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("removed");
	}

	// --- Permisos y aislamiento ---------------------------------------------------------------------------------

	@Test
	void anAgentCannotInviteChangeRolesOrRemove() throws Exception {
		this.mvc.perform(get(API + "/members").with(as(LAURA))).andExpect(status().isOk());
		this.mvc.perform(get(API + "/members/metrics").with(as(LAURA))).andExpect(status().isOk());

		this.mvc.perform(post(API + "/members").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"x@acme.example\", \"role\": \"agent\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("inviteMember"));
		this.mvc.perform(post(API + "/members/" + this.daniel + "/role").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"admin\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("changeMemberRole"));
		this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("removeMember"));
		// 403 también con el cuerpo inválido o un miembro inexistente: la URL decide antes que nada.
		this.mvc.perform(post(API + "/members/" + UUID.randomUUID() + "/role").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isForbidden());
		assertThat(this.data.membershipStatus(this.acme, this.daniel)).isEqualTo("active");
		assertThat(listMembers(ADMIN)).hasSize(5);
	}

	@Test
	void aCustomerCannotReadOrChangeTheTeam() throws Exception {
		this.mvc.perform(get(API + "/members").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listMembers"));
		this.mvc.perform(get(API + "/members/metrics").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getTeamMetrics"));
		this.mvc.perform(post(API + "/members/" + this.laura + "/remove").with(as(MARIA)))
			.andExpect(status().isForbidden());
		this.mvc.perform(get(API + "/members")).andExpect(status().isUnauthorized()).andExpect(matchesContract("listMembers"));
	}

	@Test
	void twoOrganizationsCannotSeeEachOthersMembers() throws Exception {
		assertThat(listMembers(NORTHWIND_ADMIN).findValuesAsString("email"))
			.containsExactly("admin@northwind.example", "agente@northwind.example");
		assertThat(listMembers(ADMIN).findValuesAsString("email")).doesNotContain("admin@northwind.example");

		// Un administrador de Northwind no puede cambiar ni retirar a alguien de Acme: se comporta como si no existiera.
		assertThat(changeRole(NORTHWIND_ADMIN, this.laura, "admin").getResponse().getStatus()).isEqualTo(404);
		MvcResult removal = remove(NORTHWIND_ADMIN, this.laura);
		assertThat(removal.getResponse().getStatus()).isEqualTo(404);
		MvcResult unknown = remove(NORTHWIND_ADMIN, UUID.randomUUID());
		assertThat(body(removal).path("detail")).isEqualTo(body(unknown).path("detail"));
		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("active");
		this.mvc.perform(post(API + "/members/" + this.laura + "/remove").with(as(NORTHWIND_ADMIN)))
			.andExpect(matchesContract("removeMember"));
	}

}
