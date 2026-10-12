package com.resolve.api.memberships;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.UUID;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Salir de una organización ({@code DELETE /me/organizations/{id}}): la misma retirada que {@code MemberService.remove}
 * sobre la propia membresía, con sus 404, 403 y 409. La sesión y la concurrencia tienen sus propias clases.
 */
class LeaveOrganizationTest extends TeamFixture {

	private static final String LAST_ADMIN_TYPE = "https://resolve.example/problems/last-admin";

	@Autowired
	private JdbcClient jdbc;

	/** Laura es agente en Acme y en Northwind, para salir de una organización que no es la que trae el principal. */
	@BeforeEach
	void lauraAlsoWorksInNorthwind() {
		this.data.membership(this.northwind, this.laura, "agent", "active");
	}

	MvcResult leave(String asUser, UUID organizationId) throws Exception {
		return this.mvc.perform(delete(API + "/me/organizations/" + organizationId).with(as(asUser))).andReturn();
	}

	@Test
	void anAgentLeavesAndTheMembershipIsRemovedWithItsDateAndNeverDeleted() throws Exception {
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(2)));

		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).with(as(LAURA)))
			.andExpect(status().isNoContent())
			.andExpect(matchesContract("leaveOrganization"));

		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("removed");
		assertThat(this.jdbc.sql("select removed_at is not null and removed_at = ? from memberships where organization_id = ? and user_id = ?")
			.params(Timestamp.from(TestClockConfiguration.START.plus(Duration.ofHours(2))), this.acme, this.laura)
			.query(Boolean.class)
			.single()).isTrue();
		// Northwind sigue siendo suya: la salida es de una organización, no de la persona.
		assertThat(this.data.membershipStatus(this.northwind, this.laura)).isEqualTo("active");
		this.mvc.perform(get(API + "/session/organizations").with(as(LAURA)))
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].id").value(this.northwind.toString()));
		// Y sigue en el equipo de Acme como retirada (la fila no se borra), para quien lo ve.
		JsonNode laura = null;
		for (JsonNode member : listMembers(ADMIN)) {
			if (this.laura.toString().equals(member.path("id").asString())) {
				laura = member;
			}
		}
		assertThat(laura).isNotNull();
		assertThat(laura.path("status").asString()).isEqualTo("removed");
	}

	@Test
	void leavingReleasesOnlyTheOpenTicketsOfThatOrganizationAndTheActorIsTheLeaver() throws Exception {
		// Laura tiene tickets en Acme y en Northwind y la sesión está en Acme (la primera por id o por nombre):
		// al salir de Northwind solo se liberan los de Northwind.
		UUID northwindCustomer = this.data.customer(this.northwind, "Cliente Norte", "cliente@northwind.example", "Norte");
		UUID acmeOpen = this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		UUID northOpen = this.data.ticket(this.northwind, northwindCustomer, 1, "open");
		UUID northProgress = this.data.ticket(this.northwind, northwindCustomer, 2, "in_progress");
		UUID northResolved = this.data.ticket(this.northwind, northwindCustomer, 3, "resolved");
		UUID northOther = this.data.ticket(this.northwind, northwindCustomer, 4, "open");
		for (UUID ticket : new UUID[] { acmeOpen, northOpen, northProgress, northResolved }) {
			this.data.assignTicket(ticket, this.laura);
		}
		this.data.assignTicket(northOther, this.northwindAgent);
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(3)));

		this.mvc.perform(delete(API + "/me/organizations/" + this.northwind).with(as(LAURA)))
			.andExpect(status().isNoContent());

		// Lo de Acme no se toca: ni el ticket ni el historial.
		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN))).andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));
		this.mvc.perform(get(API + "/tickets/1/activity").with(as(ADMIN))).andExpect(jsonPath("$.length()").value(0));
		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("active");
		// Lo de Northwind: sin responsable los dos sin resolver, con una actividad cuyo actor es quien sale.
		for (int number : new int[] { 1, 2 }) {
			this.mvc.perform(get(API + "/tickets/" + number).with(as(NORTHWIND_ADMIN)))
				.andExpect(jsonPath("$.assignee").isEmpty())
				.andExpect(jsonPath("$.updatedAt").value(TestClockConfiguration.START.plus(Duration.ofHours(3)).toString()));
			this.mvc.perform(get(API + "/tickets/" + number + "/activity").with(as(NORTHWIND_ADMIN)))
				.andExpect(jsonPath("$[0].type").value("assignee_changed"))
				.andExpect(jsonPath("$[0].actor.id").value(this.laura.toString()))
				.andExpect(jsonPath("$[0].from.name").value("Laura Méndez"))
				.andExpect(jsonPath("$[0].to").isEmpty());
		}
		// El resuelto conserva su responsable y el de otra persona no se toca.
		this.mvc.perform(get(API + "/tickets/3").with(as(NORTHWIND_ADMIN)))
			.andExpect(jsonPath("$.assignee.name").value("Laura Méndez"));
		this.mvc.perform(get(API + "/tickets/4").with(as(NORTHWIND_ADMIN)))
			.andExpect(jsonPath("$.assignee.name").value("Jordi Puig"));
	}

	@Test
	void unknownForeignAndAlreadyLeftOrganizationsAnswerTheSame404() throws Exception {
		UUID foreign = this.data.organization("Ajena");
		UUID foreignAdmin = this.data.staff(foreign, "admin", "Otra Persona", "otra@ajena.example");
		UUID alreadyLeft = this.data.organization("Antigua");
		this.data.membership(alreadyLeft, this.laura, "agent", "removed");

		MvcResult unknown = leave(LAURA, UUID.randomUUID());
		MvcResult other = leave(LAURA, foreign);
		MvcResult left = leave(LAURA, alreadyLeft);

		for (MvcResult result : new MvcResult[] { unknown, other, left }) {
			assertThat(result.getResponse().getStatus()).isEqualTo(404);
			matchesContract("leaveOrganization").match(result);
		}
		// Mismo cuerpo salvo el `instance`, que es la URL que el cliente mismo pidió.
		assertThat(withoutInstance(other)).isEqualTo(withoutInstance(unknown)).isEqualTo(withoutInstance(left));
		// Y nada se tocó: ni la ajena ni la ya abandonada.
		assertThat(this.data.membershipStatus(foreign, foreignAdmin)).isEqualTo("active");
		assertThat(this.data.membershipStatus(alreadyLeft, this.laura)).isEqualTo("removed");
	}

	@Test
	void leavingTwiceIsThe404OfAnOrganizationAlreadyLeft() throws Exception {
		assertThat(leave(LAURA, this.northwind).getResponse().getStatus()).isEqualTo(204);

		MvcResult again = leave(LAURA, this.northwind);

		assertThat(again.getResponse().getStatus()).isEqualTo(404);
		assertThat(withoutInstance(again)).isEqualTo(withoutInstance(leave(LAURA, UUID.randomUUID())));
	}

	@Test
	void aCustomerMembershipAnswers403AndNothingChanges() throws Exception {
		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("leaveOrganization"));

		assertThat(this.data.membershipStatus(this.acme, this.mariaUser)).isEqualTo("active");
		this.mvc.perform(get(API + "/me").with(as(MARIA))).andExpect(status().isOk());
		// Ni su 403 revela organizaciones: una ajena sigue siendo un 404 también para un cliente.
		assertThat(leave(MARIA, this.northwind).getResponse().getStatus()).isEqualTo(404);
	}

	@Test
	void aMalformedIdIsABadRequestOnTheField() throws Exception {
		this.mvc.perform(delete(API + "/me/organizations/no-es-un-uuid").with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("leaveOrganization"))
			.andExpect(jsonPath("$.errors[0].field").value("organizationId"));
	}

	@Test
	void theOnlyActiveAdminCannotLeaveAndTheConflictHasItsOwnType() throws Exception {
		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("leaveOrganization"))
			.andExpect(jsonPath("$.type").value(LAST_ADMIN_TYPE))
			.andExpect(jsonPath("$.detail").value("La organización debe conservar al menos un administrador activo."));
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");

		// Otro administrador solo invitado no cuenta: la regla mira a los activos.
		this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example", "invited");
		assertThat(leave(ADMIN, this.acme).getResponse().getStatus()).isEqualTo(409);
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
	}

	@Test
	void anAdminLeavesWhenAnotherActiveAdminRemains() throws Exception {
		this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");

		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).with(as(ADMIN))).andExpect(status().isNoContent());

		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("removed");
		// Ahora la segunda es la última y ya no puede salir.
		assertThat(leave("segunda@acme.example", this.acme).getResponse().getStatus()).isEqualTo(409);
	}

	@Test
	void anAgentLeavesEvenWhenTheOnlyAdminStays() throws Exception {
		assertThat(leave(DANIEL, this.acme).getResponse().getStatus()).isEqualTo(204);
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
	}

	@Test
	void anInvitedMembershipCanBeLeftToo() throws Exception {
		this.data.membership(this.northwind, this.invited, "agent", "invited");

		// La invitación de Acme: por ejemplo, la persona cambió de opinión antes de entrar.
		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).with(as(INVITED)))
			.andExpect(status().isNoContent());

		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("removed");
		// Entra por la otra invitación, que sigue siendo suya.
		this.mvc.perform(get(API + "/me").with(as(INVITED)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()));
	}

	@Test
	void theHeaderOfTheSessionOrganizationIsCheckedAsInAnyWrite() throws Exception {
		// La pantalla dice Northwind pero la sesión de Laura está en Acme: 409 y no se sale de nada.
		this.mvc.perform(delete(API + "/me/organizations/" + this.northwind).with(as(LAURA))
			.header("X-Organization-Id", this.northwind.toString()))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/organization-mismatch"));
		assertThat(this.data.membershipStatus(this.northwind, this.laura)).isEqualTo("active");

		// Con la organización de la sesión en la cabecera, se puede salir de otra.
		this.mvc.perform(delete(API + "/me/organizations/" + this.northwind).with(as(LAURA))
			.header("X-Organization-Id", this.acme.toString())).andExpect(status().isNoContent());
	}

	@Test
	void anAnonymousCallIsA401() throws Exception {
		this.mvc.perform(delete(API + "/me/organizations/" + this.acme)).andExpect(status().isUnauthorized());
	}

	private String withoutInstance(MvcResult result) throws Exception {
		return ((tools.jackson.databind.node.ObjectNode) body(result)).without("instance").toString();
	}

}
