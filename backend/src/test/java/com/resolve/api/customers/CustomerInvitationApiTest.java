package com.resolve.api.customers;

import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Invitar a un cliente al portal: solo administradores, una membresía {@code invited} que se activa al entrar. */
class CustomerInvitationApiTest extends CustomersFixture {

	private static final String CARLOS = "carlos@northstar.example";

	private MvcResult invite(String user, UUID customerId) throws Exception {
		return this.mvc.perform(post("/customers/" + customerId + "/invite").with(as(user))).andReturn();
	}

	@Test
	void invitesACustomerToThePortal() throws Exception {
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(ADMIN)))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("inviteCustomer"))
			.andExpect(jsonPath("$.name").value("Carlos Ruiz"))
			.andExpect(jsonPath("$.email").value(CARLOS))
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.status").value("invited"))
			.andExpect(jsonPath("$.openTickets").value(0))
			.andExpect(jsonPath("$.joinedAt").isEmpty())
			.andExpect(jsonPath("$.invitedAt").value(TestClockConfiguration.START.toString()));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.portalAccess").value("invited"));

		// Al entrar con ese correo queda activo y ligado a su registro de cliente.
		this.mvc.perform(get("/me").with(as(CARLOS)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(this.carlosCustomer.toString()));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.portalAccess").value("active"));
	}

	@Test
	void invitingACustomerWithAccessIsAConflict() throws Exception {
		assertThat(invite(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(201);
		// Invitado y todavía sin entrar.
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("inviteCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente ya tiene acceso al portal."));
		// Activo: la clienta sembrada ya tiene acceso.
		this.mvc.perform(post("/customers/" + this.mariaCustomer + "/invite").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("inviteCustomer"));
	}

	@Test
	void aRemovedPortalAccessIsInvitedAgainOnTheSameMembership() throws Exception {
		UUID customer = this.data.customer(this.acme, "Cliente Retirado", "retirado@cliente.example", null);
		UUID user = this.data.customerUser(this.acme, customer, "Cliente Retirado", "retirado@cliente.example",
				"removed");
		UUID membership = this.data.membershipId(this.acme, user);
		this.mvc.perform(get("/customers/" + customer).with(as(ADMIN))).andExpect(jsonPath("$.portalAccess").value("none"));

		MvcResult result = invite(ADMIN, customer);
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(result).path("id").asString()).isEqualTo(user.toString());
		assertThat(this.data.membershipId(this.acme, user)).isEqualTo(membership);
		assertThat(this.data.membershipStatus(this.acme, user)).isEqualTo("invited");
		this.mvc.perform(get("/customers/" + customer).with(as(ADMIN)))
			.andExpect(jsonPath("$.portalAccess").value("invited"));
	}

	@Test
	void anArchivedCustomerCannotBeInvited() throws Exception {
		assertThat(archive(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("inviteCustomer"))
			.andExpect(jsonPath("$.detail").value("Restaura el cliente antes de invitarlo al portal."));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.portalAccess").value("none"));
		// Restaurado, ya se puede invitar.
		assertThat(restore(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		assertThat(invite(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(201);
	}

	@Test
	void aCustomerWhoseEmailBelongsToTheTeamIsAConflict() throws Exception {
		UUID customer = this.data.customer(this.acme, "Laura Cliente", "LAURA@acme.example", null);
		this.mvc.perform(post("/customers/" + customer + "/invite").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("inviteCustomer"))
			.andExpect(jsonPath("$.detail").value("Este correo ya pertenece al equipo."));
		// La agente sigue siendo agente.
		this.mvc.perform(get("/me").with(as(LAURA))).andExpect(jsonPath("$.role").value("agent"));
	}

	@Test
	void anExistingUserOfAnotherOrganizationKeepsTheirNameAndTheirOtherAccess() throws Exception {
		UUID customer = this.data.customer(this.acme, "Marta en Acme", "marta@soler.example", null);
		UUID martaUser = this.data.customerUser(this.northwind, this.northwindCustomer, "Marta Soler",
				"marta@soler.example");

		MvcResult result = invite(ADMIN, customer);
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(result).path("id").asString()).isEqualTo(martaUser.toString());
		assertThat(body(result).path("name").asString()).isEqualTo("Marta Soler");
		assertThat(this.data.membershipStatus(this.acme, martaUser)).isEqualTo("invited");
		assertThat(this.data.membershipStatus(this.northwind, martaUser)).isEqualTo("active");
	}

	@Test
	void aUserLinkedToAnotherCustomerIsAConflict() throws Exception {
		// El correo del cliente cambió después de invitarlo: el usuario viejo sigue ligado al primer registro.
		UUID other = this.data.customer(this.acme, "Otra Persona", "otra@cliente.example", null);
		this.data.customerUser(this.acme, other, "Otra Persona", "compartido@cliente.example");
		UUID customer = this.data.customer(this.acme, "Compartido", "compartido@cliente.example", null);
		this.mvc.perform(post("/customers/" + customer + "/invite").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("inviteCustomer"))
			.andExpect(jsonPath("$.detail").value("Este correo ya da acceso al portal a otro cliente."));
	}

	@Test
	@Timeout(30)
	void twoSimultaneousInvitationsCreateOneMembership() throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			CountDownLatch start = new CountDownLatch(1);
			Callable<MvcResult> call = () -> {
				start.await();
				return invite(ADMIN, this.carlosCustomer);
			};
			Future<MvcResult> first = executor.submit(call);
			Future<MvcResult> second = executor.submit(call);
			start.countDown();
			int[] statuses = { first.get(10, TimeUnit.SECONDS).getResponse().getStatus(),
					second.get(10, TimeUnit.SECONDS).getResponse().getStatus() };
			assertThat(statuses).containsExactlyInAnyOrder(201, 409);
		}
		finally {
			executor.shutdownNow();
		}
	}

	@Test
	void anAgentCannotInviteACustomerToThePortal() throws Exception {
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("inviteCustomer"));
		// 403 también con un cliente inexistente: la URL decide antes de buscarlo.
		this.mvc.perform(post("/customers/" + UUID.randomUUID() + "/invite").with(as(LAURA)))
			.andExpect(status().isForbidden());
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(MARIA)))
			.andExpect(status().isForbidden());
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("inviteCustomer"));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.portalAccess").value("none"));
	}

	@Test
	void foreignUnknownAndMalformedCustomerIdsAreRejected() throws Exception {
		this.data.staff(this.northwind, "admin", "Ada Norte", "admin@northwind.example");
		MvcResult foreign = invite("admin@northwind.example", this.carlosCustomer);
		MvcResult unknown = invite(ADMIN, UUID.randomUUID());
		assertThat(foreign.getResponse().getStatus()).isEqualTo(404);
		assertThat(unknown.getResponse().getStatus()).isEqualTo(404);
		JsonNode foreignBody = body(foreign);
		assertThat(foreignBody.path("detail")).isEqualTo(body(unknown).path("detail"));
		this.mvc.perform(post("/customers/no-es-un-uuid/invite").with(as(ADMIN)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("inviteCustomer"));
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as("admin@northwind.example")))
			.andExpect(matchesContract("inviteCustomer"));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.portalAccess").value("none"));
	}

}
