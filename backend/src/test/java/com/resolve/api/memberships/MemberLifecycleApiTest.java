package com.resolve.api.memberships;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Estados de membresía frente a la autenticación: las invitaciones se activan en el primer acceso y las retiradas no entran. */
class MemberLifecycleApiTest extends TeamFixture {

	@Autowired
	private MemberService members;

	@Test
	void anInvitedMemberBecomesActiveOnFirstRequest() throws Exception {
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("invited");
		assertThat(this.data.membershipJoinedAt(this.acme, this.invited)).isNull();

		this.mvc.perform(get("/me").with(as(INVITED)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.role").value("agent"))
			.andExpect(jsonPath("$.user.email").value(INVITED));

		// La activación se confirmó en la base de datos, con la fecha del reloj, no solo en la respuesta.
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("active");
		assertThat(this.data.membershipJoinedAt(this.acme, this.invited)).isEqualTo(TestClockConfiguration.START);
	}

	@Test
	void aLaterRequestKeepsTheJoinDate() throws Exception {
		this.mvc.perform(get("/me").with(as(INVITED))).andExpect(status().isOk());
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofDays(2)));
		this.mvc.perform(get("/me").with(as(INVITED))).andExpect(status().isOk());
		assertThat(this.data.membershipJoinedAt(this.acme, this.invited)).isEqualTo(TestClockConfiguration.START);
	}

	@Test
	void anInvitedMemberCanUseTheApiRightAway() throws Exception {
		this.mvc.perform(get("/assignees").with(as(INVITED)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].email").value(org.hamcrest.Matchers.hasItem(INVITED)));
	}

	@Test
	void aRemovedMemberGets401() throws Exception {
		this.mvc.perform(get("/me").with(as(REMOVED))).andExpect(status().isUnauthorized()).andExpect(matchesContract("getMe"));
		this.mvc.perform(get("/tickets").with(as(REMOVED))).andExpect(status().isUnauthorized());
		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("removed");
	}

	@Test
	void activatingARemovedMembershipDoesNotBringItBack() {
		// La carrera real es una retirada confirmada entre la lectura del resolvedor y la activación.
		UUID membership = this.data.membershipId(this.acme, this.removed);
		assertThat(this.members.activate(membership)).isEqualTo(MemberStatus.REMOVED);
		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("removed");
		assertThat(this.data.membershipJoinedAt(this.acme, this.removed)).isNotEqualTo(TestClockConfiguration.START);
	}

	@Test
	void aRemovedMembershipFallsThroughToTheUsersOtherOrganization() throws Exception {
		UUID northwind = this.data.organization("Northwind");
		// Mismo usuario global en las dos organizaciones: la retirada de Acme no le quita Northwind.
		UUID user = this.data.user("Dos Orgs", "dos@orgs.example");
		this.data.membership(this.acme, user, "agent", "removed");
		this.data.membership(northwind, user, "agent", "active");
		this.mvc.perform(get("/me").with(as("dos@orgs.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(northwind.toString()));
	}

	@Test
	void anInvitedCustomerBecomesActiveAndARemovedOneGets401() throws Exception {
		UUID invitedCustomer = this.data.customer(this.acme, "Cliente Invitado", "cinvitado@cliente.example", null);
		UUID invited = this.data.customerUser(this.acme, invitedCustomer, "Cliente Invitado", "cinvitado@cliente.example",
				"invited");
		UUID removedCustomer = this.data.customer(this.acme, "Cliente Retirado", "cretirado@cliente.example", null);
		this.data.customerUser(this.acme, removedCustomer, "Cliente Retirado", "cretirado@cliente.example", "removed");

		this.mvc.perform(get("/me").with(as("cinvitado@cliente.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(invitedCustomer.toString()));
		assertThat(this.data.membershipStatus(this.acme, invited)).isEqualTo("active");
		this.mvc.perform(get("/me").with(as("cretirado@cliente.example"))).andExpect(status().isUnauthorized());
	}

	@Test
	void theInvitationOfAnArchivedCustomerIsNotActivated() throws Exception {
		UUID customer = this.data.customer(this.acme, "Cliente Archivado", "carchivado@cliente.example", null);
		UUID user = this.data.customerUser(this.acme, customer, "Cliente Archivado", "carchivado@cliente.example",
				"invited");
		this.data.archiveCustomer(customer, TestClockConfiguration.START);

		this.mvc.perform(get("/me").with(as("carchivado@cliente.example"))).andExpect(status().isUnauthorized());
		assertThat(this.data.membershipStatus(this.acme, user)).isEqualTo("invited");
	}

	// --- Cambiar el rol y retirar -------------------------------------------------------------------------------

	@Test
	void removingAMemberUnassignsItsOpenTicketsWithActivity() throws Exception {
		UUID open = this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		UUID progress = this.data.ticket(this.acme, this.mariaCustomer, 2, "in_progress");
		UUID waiting = this.data.ticket(this.acme, this.mariaCustomer, 3, "waiting");
		UUID resolved = this.data.ticket(this.acme, this.mariaCustomer, 4, "resolved");
		UUID others = this.data.ticket(this.acme, this.mariaCustomer, 5, "open");
		for (UUID ticket : new UUID[] { open, progress, waiting, resolved }) {
			this.data.assignTicket(ticket, this.laura);
		}
		this.data.assignTicket(others, this.daniel);
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(3)));

		this.mvc.perform(post("/members/" + this.laura + "/remove").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("removeMember"))
			.andExpect(jsonPath("$.id").value(this.laura.toString()))
			.andExpect(jsonPath("$.status").value("removed"))
			.andExpect(jsonPath("$.openTickets").value(0));

		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("removed");
		for (int number : new int[] { 1, 2, 3 }) {
			this.mvc.perform(get("/tickets/" + number).with(as(ADMIN)))
				.andExpect(jsonPath("$.assignee").isEmpty())
				// La liberación sube la versión y mueve updatedAt, como un PATCH del administrador.
				.andExpect(jsonPath("$.updatedAt").value(TestClockConfiguration.START.plus(Duration.ofHours(3)).toString()));
			this.mvc.perform(get("/tickets/" + number + "/activity").with(as(ADMIN)))
				.andExpect(matchesContract("listActivity"))
				.andExpect(jsonPath("$[0].type").value("assignee_changed"))
				.andExpect(jsonPath("$[0].actor.id").value(this.admin.toString()))
				.andExpect(jsonPath("$[0].from.name").value("Laura Méndez"))
				.andExpect(jsonPath("$[0].to").isEmpty())
				.andExpect(jsonPath("$.length()").value(1));
		}
		// El ticket resuelto conserva a su responsable y el de otro miembro no se toca.
		this.mvc.perform(get("/tickets/4").with(as(ADMIN))).andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));
		this.mvc.perform(get("/tickets/5").with(as(ADMIN))).andExpect(jsonPath("$.assignee.name").value("Daniel Santos"));
		this.mvc.perform(get("/tickets/4/activity").with(as(ADMIN))).andExpect(jsonPath("$.length()").value(0));
		// Ya no entra, no es asignable y desaparece de las métricas del equipo.
		this.mvc.perform(get("/me").with(as(LAURA))).andExpect(status().isUnauthorized());
		this.mvc.perform(get("/assignees").with(as(ADMIN)))
			.andExpect(jsonPath("$[*].email").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(LAURA))));
		this.mvc.perform(get("/members/metrics").with(as(ADMIN)))
			.andExpect(jsonPath("$.staff").value(2))
			.andExpect(jsonPath("$.assignedOpen").value(1))
			.andExpect(jsonPath("$.unassignedOpen").value(3));
	}

	@Test
	void removalIsRolledBackWhenTheTicketsCannotBeReleased() throws Exception {
		// Una actividad con actor desconocido haría fallar el guardado: el miembro no debe quedar retirado a medias.
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		this.data.assignTicket(ticket, this.laura);
		CurrentMember ghost = new CurrentMember(UUID.randomUUID(), "Fantasma", "fantasma@acme.example", this.acme,
				Role.ADMIN, null);
		assertThatThrownBy(() -> this.members.remove(ghost, this.laura)).isInstanceOf(DataIntegrityViolationException.class);
		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("active");
		this.mvc.perform(get("/tickets/1").with(as(ADMIN))).andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));
	}

	@Test
	void removingAnInvitedMemberIsAllowedAndKeepsTheRowForAReinvitation() throws Exception {
		assertThat(remove(ADMIN, this.invited).getResponse().getStatus()).isEqualTo(200);
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("removed");
		this.mvc.perform(get("/me").with(as(INVITED))).andExpect(status().isUnauthorized());
		// Retirar dos veces es un conflicto de estado, no un 404.
		this.mvc.perform(post("/members/" + this.invited + "/remove").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("removeMember"));
	}

	@Test
	void removingYourselfOrTheLastAdminIsAConflict() throws Exception {
		// Con otro administrador activo, retirarse a uno mismo sigue siendo un conflicto.
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		this.mvc.perform(post("/members/" + this.admin + "/remove").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("removeMember"))
			.andExpect(jsonPath("$.detail").value("No puedes retirarte a ti mismo del equipo."));
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");

		// El último administrador no se retira ni siquiera por otro actor: se prueba la regla del servicio.
		this.data.setMembershipStatus(this.acme, second, "removed");
		CurrentMember otherActor = new CurrentMember(UUID.randomUUID(), "Otro", "otro@acme.example", this.acme,
				Role.ADMIN, null);
		assertThatThrownBy(() -> this.members.remove(otherActor, this.admin)).isInstanceOf(ConflictException.class)
			.hasMessageContaining("al menos un administrador");
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
		// Un administrador solo invitado no cuenta como activo.
		this.data.setMembershipStatus(this.acme, second, "invited");
		assertThatThrownBy(() -> this.members.remove(otherActor, this.admin)).isInstanceOf(ConflictException.class);
	}

	@Test
	void changingTheLastAdminRoleIsAConflict() throws Exception {
		this.mvc.perform(post("/members/" + this.admin + "/role").with(as(ADMIN))
			.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
			.content("{\"role\": \"agent\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("changeMemberRole"))
			.andExpect(jsonPath("$.detail").value("La organización debe conservar al menos un administrador activo."));
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
		this.mvc.perform(get("/me").with(as(ADMIN))).andExpect(jsonPath("$.role").value("admin"));

		// Otro administrador solo invitado no cuenta: la regla mira a los activos.
		this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example", "invited");
		assertThat(changeRole(ADMIN, this.admin, "agent").getResponse().getStatus()).isEqualTo(409);
		// Con otro administrador activo, degradarse sí es posible.
		this.data.staff(this.acme, "admin", "Tercera Admin", "tercera@acme.example");
		MvcResult demoted = changeRole(ADMIN, this.admin, "agent");
		assertThat(demoted.getResponse().getStatus()).isEqualTo(200);
		assertThat(body(demoted).path("role").asString()).isEqualTo("agent");
	}

	@Test
	void reopeningAResolvedTicketOfARemovedMemberUnassignsIt() throws Exception {
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "resolved");
		this.data.assignTicket(ticket, this.laura);
		assertThat(remove(ADMIN, this.laura).getResponse().getStatus()).isEqualTo(200);
		// Resuelto, conserva a su responsable retirado.
		this.mvc.perform(get("/tickets/1").with(as(ADMIN))).andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));

		this.mvc.perform(patch("/tickets/1").with(as(ADMIN))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"status\": \"open\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateTicket"))
			.andExpect(jsonPath("$.status").value("open"))
			.andExpect(jsonPath("$.assignee").isEmpty());
		List<JsonNode> changes = assigneeChanges(1);
		assertThat(changes).hasSize(1);
		assertThat(changes.get(0).path("actor").path("id").asString()).isEqualTo(this.admin.toString());
		assertThat(changes.get(0).path("from").path("name").asString()).isEqualTo("Laura Méndez");
		assertThat(changes.get(0).path("to").isNull()).isTrue();
		assertThat(member(listMembers(ADMIN), LAURA).path("openTickets").asInt()).isZero();
		this.mvc.perform(get("/members/metrics").with(as(ADMIN)))
			.andExpect(jsonPath("$.assignedOpen").value(0))
			.andExpect(jsonPath("$.unassignedOpen").value(1));
	}

	@Test
	void reopeningWithANewValidAssigneeKeepsTheNewOne() throws Exception {
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "resolved");
		this.data.assignTicket(ticket, this.laura);
		assertThat(remove(ADMIN, this.laura).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(patch("/tickets/1").with(as(ADMIN))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"status\": \"open\", \"assigneeId\": \"%s\"}".formatted(this.daniel)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.assignee.name").value("Daniel Santos"));
		assertThat(assigneeChanges(1)).hasSize(1);
		assertThat(assigneeChanges(1).get(0).path("to").path("name").asString()).isEqualTo("Daniel Santos");
	}

	@Test
	void aPatchThatResendsTheSameRemovedAssigneeOnAResolvedTicketIsNotRejected() throws Exception {
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "resolved");
		this.data.assignTicket(ticket, this.laura);
		assertThat(remove(ADMIN, this.laura).getResponse().getStatus()).isEqualTo(200);

		this.mvc.perform(patch("/tickets/1").with(as(ADMIN))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"assigneeId\": \"%s\", \"priority\": \"high\"}".formatted(this.laura)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.priority").value("high"))
			.andExpect(jsonPath("$.status").value("resolved"))
			.andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));
		assertThat(assigneeChanges(1)).isEmpty();
	}

	private List<JsonNode> assigneeChanges(int number) throws Exception {
		JsonNode activity = body(this.mvc.perform(get("/tickets/" + number + "/activity").with(as(ADMIN))).andReturn());
		List<JsonNode> changes = new ArrayList<>();
		for (JsonNode entry : activity) {
			if ("assignee_changed".equals(entry.path("type").asString())) {
				changes.add(entry);
			}
		}
		return changes;
	}

	private static JsonNode member(JsonNode team, String email) {
		for (JsonNode member : team) {
			if (email.equals(member.path("email").asString())) {
				return member;
			}
		}
		throw new AssertionError("No aparece " + email + " en el equipo");
	}

}
