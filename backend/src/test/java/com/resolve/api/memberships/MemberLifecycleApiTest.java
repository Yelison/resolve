package com.resolve.api.memberships;

import java.time.Duration;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Estados de membresía frente a la autenticación: las invitaciones se activan en el primer acceso y las retiradas no entran. */
class MemberLifecycleApiTest extends ApiIntegrationTest {

	private static final String INVITED = "invitada@acme.example";

	private static final String REMOVED = "retirado@acme.example";

	@Autowired
	private MemberService members;

	private UUID acme;

	private UUID invitedUser;

	private UUID removedUser;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", "admin@acme.example");
		this.invitedUser = this.data.staff(this.acme, "agent", "Inés Invitada", INVITED, "invited");
		this.removedUser = this.data.staff(this.acme, "agent", "Raúl Retirado", REMOVED, "removed");
	}

	@Test
	void anInvitedMemberBecomesActiveOnFirstRequest() throws Exception {
		assertThat(this.data.membershipStatus(this.acme, this.invitedUser)).isEqualTo("invited");
		assertThat(this.data.membershipJoinedAt(this.acme, this.invitedUser)).isNull();

		this.mvc.perform(get("/me").with(as(INVITED)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.role").value("agent"))
			.andExpect(jsonPath("$.user.email").value(INVITED));

		// La activación se confirmó en la base de datos, con la fecha del reloj, no solo en la respuesta.
		assertThat(this.data.membershipStatus(this.acme, this.invitedUser)).isEqualTo("active");
		assertThat(this.data.membershipJoinedAt(this.acme, this.invitedUser)).isEqualTo(TestClockConfiguration.START);
	}

	@Test
	void aLaterRequestKeepsTheJoinDate() throws Exception {
		this.mvc.perform(get("/me").with(as(INVITED))).andExpect(status().isOk());
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofDays(2)));
		this.mvc.perform(get("/me").with(as(INVITED))).andExpect(status().isOk());
		assertThat(this.data.membershipJoinedAt(this.acme, this.invitedUser)).isEqualTo(TestClockConfiguration.START);
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
		assertThat(this.data.membershipStatus(this.acme, this.removedUser)).isEqualTo("removed");
	}

	@Test
	void activatingARemovedMembershipDoesNotBringItBack() {
		// La carrera real es una retirada confirmada entre la lectura del resolvedor y la activación.
		UUID membership = this.data.membershipId(this.acme, this.removedUser);
		assertThat(this.members.activate(membership)).isEqualTo(MemberStatus.REMOVED);
		assertThat(this.data.membershipStatus(this.acme, this.removedUser)).isEqualTo("removed");
		assertThat(this.data.membershipJoinedAt(this.acme, this.removedUser)).isNotEqualTo(TestClockConfiguration.START);
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

}
