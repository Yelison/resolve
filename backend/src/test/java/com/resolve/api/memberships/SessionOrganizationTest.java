package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cambio de organización en la sesión (OIDC): la elección se valida contra las membresías de la identidad verificada y
 * se guarda en la sesión del servidor. Una organización ajena y una que no existe se responden igual.
 */
class SessionOrganizationTest extends OidcApiIntegrationTest {

	private static final String EMAIL = "sofia@acme.example";

	private UUID acme;

	private UUID northwind;

	private UUID sofia;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		this.sofia = this.data.staff(this.acme, "admin", "Sofía Ríos", EMAIL);
		this.data.membership(this.northwind, this.sofia, "agent", "active");
		this.data.staff(this.northwind, "admin", "Jordi Puig", "jordi@northwind.example");
	}

	@Test
	void listsTheOrganizationsWhereTheCallerCanWorkByName() throws Exception {
		this.mvc.perform(get("/session/organizations").session(signedIn(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listSessionOrganizations"))
			.andExpect(jsonPath("$.length()").value(2))
			.andExpect(jsonPath("$[0].id").value(this.acme.toString()))
			.andExpect(jsonPath("$[0].name").value("Acme"))
			.andExpect(jsonPath("$[1].id").value(this.northwind.toString()))
			.andExpect(jsonPath("$[1].name").value("Northwind"));
	}

	@Test
	void doesNotListRemovedMembershipsArchivedCustomersOrOtherPeoplesOrganizations() throws Exception {
		UUID removedOrg = this.data.organization("Antigua");
		this.data.membership(removedOrg, this.sofia, "agent", "removed");
		UUID archivedOrg = this.data.organization("Archivada");
		UUID customer = this.data.customer(archivedOrg, "Sofía", EMAIL, "Cliente");
		this.data.customerMembership(archivedOrg, this.sofia, customer);
		this.data.archiveCustomer(customer, Instant.parse("2026-10-01T10:00:00Z"));
		this.data.organization("Ajena");

		this.mvc.perform(get("/session/organizations").session(signedIn(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void meListsTheSameOrganizationsSoTheClientCanOfferTheSwitch() throws Exception {
		this.mvc.perform(get("/me").session(signedIn(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organizations.length()").value(2))
			.andExpect(jsonPath("$.organizations[1].id").value(this.northwind.toString()));
	}

	@Test
	void switchingToAnOwnOrganizationChangesWhatMeReturnsInTheSameSession() throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(get("/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.role").value("admin"));

		this.mvc.perform(select(session, this.northwind))
			.andExpect(status().isOk())
			.andExpect(matchesContract("selectSessionOrganization"))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()))
			.andExpect(jsonPath("$.role").value("agent"));

		this.mvc.perform(get("/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()))
			.andExpect(jsonPath("$.organization.name").value("Northwind"))
			.andExpect(jsonPath("$.role").value("agent"));
		// El rol y el alcance también cambian: un agente de Northwind ya no administra el equipo.
		this.mvc.perform(post("/members").session(session)
			.with(csrfToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"nueva@northwind.example\",\"role\":\"agent\"}")).andExpect(status().isForbidden());
	}

	@Test
	void switchingToAForeignOrganizationIsForbiddenAndKeepsTheCurrentOne() throws Exception {
		UUID foreign = this.data.organization("Ajena");
		this.data.staff(foreign, "admin", "Otra Persona", "otra@ajena.example");
		MockHttpSession session = signedIn(EMAIL);

		this.mvc.perform(select(session, foreign))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("selectSessionOrganization"));

		this.mvc.perform(get("/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void anOrganizationThatDoesNotExistAnswersExactlyLikeAForeignOne() throws Exception {
		UUID foreign = this.data.organization("Ajena");
		MockHttpSession session = signedIn(EMAIL);

		MvcResult foreignResult = this.mvc.perform(select(session, foreign)).andReturn();
		MvcResult missingResult = this.mvc.perform(select(session, UUID.randomUUID())).andReturn();

		assertThat(missingResult.getResponse().getStatus()).isEqualTo(403).isEqualTo(foreignResult.getResponse().getStatus());
		assertThat(missingResult.getResponse().getContentAsString()).isEqualTo(foreignResult.getResponse().getContentAsString());
	}

	@Test
	void anOrganizationWhereTheMembershipWasRemovedIsForbidden() throws Exception {
		this.data.setMembershipStatus(this.northwind, this.sofia, "removed");

		this.mvc.perform(select(signedIn(EMAIL), this.northwind)).andExpect(status().isForbidden());
	}

	@Test
	void anOrganizationWhereTheCustomerWasArchivedIsForbidden() throws Exception {
		UUID archivedOrg = this.data.organization("Archivada");
		UUID customer = this.data.customer(archivedOrg, "Sofía", EMAIL, "Cliente");
		this.data.customerMembership(archivedOrg, this.sofia, customer);
		this.data.archiveCustomer(customer, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(select(signedIn(EMAIL), archivedOrg)).andExpect(status().isForbidden());
	}

	@Test
	void aMalformedOrIncompleteBodyIsABadRequestOnTheField() throws Exception {
		MockHttpSession session = signedIn(EMAIL);

		for (String body : new String[] { "{\"organizationId\":\"no-es-un-uuid\"}", "{}", "{\"organizationId\":null}",
				"{\"organizationId\":\"" + this.northwind + "\",\"extra\":1}", "[]" }) {
			this.mvc.perform(post("/session/organization").session(session)
				.with(csrfToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("selectSessionOrganization"));
		}
		this.mvc.perform(post("/session/organization").session(session).with(csrfToken()))
			.andExpect(status().isBadRequest());
	}

	@Test
	void anUnauthenticatedCallIsA401() throws Exception {
		this.mvc.perform(get("/session/organizations")).andExpect(status().isUnauthorized());
		this.mvc.perform(post("/session/organization").with(csrfToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + this.acme + "\"}")).andExpect(status().isUnauthorized());
	}

	@Test
	void aPortalCustomerCanListAndSwitchTheirOwnOrganizations() throws Exception {
		UUID customer = this.data.customer(this.acme, "María Pérez", "maria@cliente.example", "Cliente");
		UUID maria = this.data.customerUser(this.acme, customer, "María Pérez", "maria@cliente.example");
		UUID otherCustomer = this.data.customer(this.northwind, "María Pérez", "maria@cliente.example", "Cliente");
		this.data.customerMembership(this.northwind, maria, otherCustomer);
		MockHttpSession session = signedIn("maria@cliente.example");

		this.mvc.perform(get("/session/organizations").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(2));
		this.mvc.perform(select(session, this.northwind))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(otherCustomer.toString()));
	}

	@Test
	void theChoiceBelongsToTheSessionAndAnotherSessionKeepsTheFirstOrganization() throws Exception {
		MockHttpSession first = signedIn(EMAIL);
		this.mvc.perform(select(first, this.northwind)).andExpect(status().isOk());

		this.mvc.perform(get("/me").session(signedIn(EMAIL)))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void ifTheChosenMembershipIsRemovedLaterTheSessionFallsBackToAUsableOne() throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(select(session, this.northwind)).andExpect(status().isOk());

		this.data.setMembershipStatus(this.northwind, this.sofia, "removed");

		this.mvc.perform(get("/me").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void anInvitedMembershipCanBeChosenAndIsActivatedByTheSwitch() throws Exception {
		UUID invitedOrg = this.data.organization("Zeta");
		this.data.membership(invitedOrg, this.sofia, "agent", "invited");

		this.mvc.perform(select(signedIn(EMAIL), invitedOrg))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(invitedOrg.toString()));

		assertThat(this.data.membershipStatus(invitedOrg, this.sofia)).isEqualTo("active");
	}

	private static MockHttpServletRequestBuilder select(MockHttpSession session, UUID organizationId) {
		return post("/session/organization").session(session)
			.with(csrfToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + organizationId + "\"}");
	}

}
