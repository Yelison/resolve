package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.resolve.api.organizations.OrganizationColors;
import com.resolve.api.support.ApiIntegrationTest;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code OrganizationRef.role}, {@code color} y {@code memberCount}: el rol de la persona en cada organización y el personal activo
 * de esa organización, calculado en una consulta para todas.
 */
class OrganizationRefsTest extends ApiIntegrationTest {

	private static final String EMAIL = "sofia@acme.example";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@Autowired
	private JdbcClient jdbc;

	private UUID acme;

	private UUID northwind;

	private UUID sofia;

	private UUID laura;

	@BeforeEach
	void seed() {
		// Acme (orden alfabético: primera): Sofía es admin entre 1 admin + 2 agentes activos, 1 invitada, 1 retirada.
		this.acme = this.data.organization("Acme");
		this.sofia = this.data.staff(this.acme, "admin", "Sofía Ríos", EMAIL);
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", "laura@acme.example");
		this.data.staff(this.acme, "agent", "Daniel Santos", "daniel@acme.example");
		this.data.staff(this.acme, "agent", "Inés Invitada", "ines@acme.example", "invited");
		this.data.staff(this.acme, "agent", "Raúl Retirado", "raul@acme.example", "removed");
		UUID customer = this.data.customer(this.acme, "María Pérez", "maria@cliente.example", "Cliente");
		this.data.customerUser(this.acme, customer, "María Pérez", "maria@cliente.example");
		// Northwind: Sofía es agente y tiene mucho más personal, que no debe contaminar la cifra de Acme.
		this.northwind = this.data.organization("Northwind");
		this.data.membership(this.northwind, this.sofia, "agent", "active");
		for (int i = 0; i < 5; i++) {
			this.data.staff(this.northwind, "agent", "Agente " + i, "agente" + i + "@northwind.example");
		}
	}

	@Test
	void eachOrganizationCarriesTheCallersRoleThereAndTheActiveStaffOfThatOrganization() throws Exception {
		this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listSessionOrganizations"))
			.andExpect(jsonPath("$.length()").value(2))
			.andExpect(jsonPath("$[0].id").value(this.acme.toString()))
			.andExpect(jsonPath("$[0].role").value("admin"))
			// Ella, Laura y Daniel: ni la invitada, ni el retirado, ni la clienta.
			.andExpect(jsonPath("$[0].memberCount").value(3))
			.andExpect(jsonPath("$[1].id").value(this.northwind.toString()))
			.andExpect(jsonPath("$[1].role").value("agent"))
			.andExpect(jsonPath("$[1].memberCount").value(6));
	}

	@Test
	void meCarriesTheSameRefs() throws Exception {
		this.mvc.perform(get(API + "/me").with(as(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organizations[0].role").value("admin"))
			.andExpect(jsonPath("$.organizations[0].memberCount").value(3))
			.andExpect(jsonPath("$.organizations[1].role").value("agent"))
			.andExpect(jsonPath("$.organizations[1].memberCount").value(6));
	}

	@Test
	void aCustomerMembershipHasNoCountAndNeverSeesTheTeamSize() throws Exception {
		// María es clienta de Acme desde el sembrado.
		this.mvc.perform(get(API + "/session/organizations").with(as("maria@cliente.example")))
			.andExpect(matchesContract("listSessionOrganizations"))
			.andExpect(jsonPath("$[0].role").value("customer"))
			.andExpect(jsonPath("$[0].memberCount").doesNotExist());
		// El campo está, con null: el contrato lo declara obligatorio.
		String body = this.mvc.perform(get(API + "/session/organizations").with(as("maria@cliente.example")))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(body).contains("\"memberCount\":null");
	}

	@Test
	void aPersonWhoIsStaffInOneOrganizationAndCustomerInAnotherGetsACountOnlyForTheFirst() throws Exception {
		UUID other = this.data.organization("Zeta");
		UUID zetaCustomer = this.data.customer(other, "Sofía Ríos", EMAIL, "Cliente");
		this.data.customerMembership(other, this.sofia, zetaCustomer);

		this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
			.andExpect(jsonPath("$.length()").value(3))
			.andExpect(jsonPath("$[0].memberCount").value(3))
			.andExpect(jsonPath("$[2].id").value(other.toString()))
			.andExpect(jsonPath("$[2].role").value("customer"))
			.andExpect(jsonPath("$[2].memberCount").doesNotExist());
	}

	@Test
	void theCountFollowsTheActiveStaffAndIgnoresOtherOrganizations() throws Exception {
		this.data.staff(this.northwind, "admin", "Otra Admin", "otraadmin@northwind.example");
		this.data.setMembershipStatus(this.acme, this.laura, "removed");

		this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
			.andExpect(jsonPath("$[0].memberCount").value(2))
			.andExpect(jsonPath("$[1].memberCount").value(7));
	}

	@Test
	void everyRefCarriesTheColorOfItsOrganization() throws Exception {
		UUID beta = this.data.organization("Beta");
		this.data.staff(beta, "admin", "Admin Beta", "admin@beta.example");
		this.data.membership(beta, this.sofia, "agent", "active");
		this.jdbc.sql("update organizations set color = 'brick' where id = ?").param(beta).update();

		JsonNode refs = JSON.readTree(this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
			.andExpect(matchesContract("listSessionOrganizations"))
			.andReturn()
			.getResponse()
			.getContentAsString());

		for (JsonNode ref : refs) {
			UUID id = UUID.fromString(ref.path("id").asString());
			assertThat(ref.path("color").asString()).isEqualTo(id.equals(beta) ? "brick" : OrganizationColors.forId(id));
		}
		assertThat(refs.size()).isEqualTo(3);
	}

	@Test
	void anInvitedMembershipListsItsRoleAndTheSameCount() throws Exception {
		UUID invitedOrg = this.data.organization("Beta");
		this.data.staff(invitedOrg, "admin", "Admin Beta", "admin@beta.example");
		this.data.membership(invitedOrg, this.sofia, "agent", "invited");

		this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
			.andExpect(jsonPath("$[1].id").value(invitedOrg.toString()))
			.andExpect(jsonPath("$[1].role").value("agent"))
			// Una sola persona activa (la administradora): la invitada todavía no cuenta.
			.andExpect(jsonPath("$[1].memberCount").value(1));
	}

	/** Sin una consulta por organización: las sentencias son las mismas con dos organizaciones que con ocho. */
	@Test
	void theStatementsDoNotGrowWithTheNumberOfOrganizations() throws Exception {
		Statistics statistics = this.entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
		statistics.setStatisticsEnabled(true);
		try {
			statistics.clear();
			this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL))).andExpect(status().isOk());
			long withTwo = statistics.getPrepareStatementCount();

			for (int i = 0; i < 6; i++) {
				UUID extra = this.data.organization("Extra " + i);
				this.data.staff(extra, "admin", "Admin " + i, "admin" + i + "@extra.example");
				this.data.membership(extra, this.sofia, "agent", "active");
			}
			statistics.clear();
			this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(8));
			long withEight = statistics.getPrepareStatementCount();

			assertThat(withEight).isEqualTo(withTwo);
		}
		finally {
			statistics.setStatisticsEnabled(false);
		}
	}

	@Test
	void anOrganizationWhereTheCustomerWasArchivedIsNotListed() throws Exception {
		UUID archivedOrg = this.data.organization("Archivada");
		UUID customer = this.data.customer(archivedOrg, "Sofía", EMAIL, "Cliente");
		this.data.customerMembership(archivedOrg, this.sofia, customer);
		this.data.archiveCustomer(customer, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(get(API + "/session/organizations").with(as(EMAIL))).andExpect(jsonPath("$.length()").value(2));
	}

}
