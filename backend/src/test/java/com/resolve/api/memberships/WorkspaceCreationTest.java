package com.resolve.api.memberships;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.sql.DataSource;

import com.resolve.api.organizations.OrganizationColors;
import com.resolve.api.support.RowLock;
import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Crear un espacio ({@code POST /organizations}, docs/decisions/0004-workspaces.md): quién puede, el límite de tres con
 * la regla «creados por ti y en los que sigues activa», la sesión que pasa al espacio nuevo, el color calculado del id y
 * los valores por defecto del esquema. La concurrencia comparte el bloqueo por persona con salir de un espacio.
 */
class WorkspaceCreationTest extends TeamFixture {

	private static final String LIMIT_TYPE = "https://resolve.example/problems/organization-limit";

	private static final int WAIT_SECONDS = 10;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private DataSource dataSource;

	private final ExecutorService executor = Executors.newFixedThreadPool(4);

	@AfterEach
	void stopThreads() throws Exception {
		this.executor.shutdownNow();
		assertThat(this.executor.awaitTermination(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
	}

	private static String body(String name) {
		return "{\"name\": \"%s\", \"timeZone\": \"America/Bogota\"}".formatted(name);
	}

	private MockHttpServletRequestBuilder createRequest(String asUser, String json) {
		return post(API + "/organizations").with(as(asUser)).contentType(MediaType.APPLICATION_JSON).content(json);
	}

	private MvcResult create(String asUser, String name) throws Exception {
		return this.mvc.perform(createRequest(asUser, body(name))).andReturn();
	}

	private UUID createdId(MvcResult result) throws Exception {
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		return UUID.fromString(body(result).path("organization").path("id").asString());
	}

	private int organizationCount() {
		return this.jdbc.sql("select count(*) from organizations").query(Integer.class).single();
	}

	// --- Quién puede y qué crea -----------------------------------------------------------------------------------

	@Test
	void anAdminCreatesAWorkspaceTheSessionSwitchesToItAndItGetsItsColorAndDefaults() throws Exception {
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(5)));
		MockHttpSession session = new MockHttpSession();

		MvcResult result = this.mvc.perform(createRequest(ADMIN, "{\"name\": \"  Mi espacio  \", \"timeZone\": \"Europe/Madrid\"}")
			.session(session)).andExpect(status().isCreated()).andExpect(matchesContract("createOrganization")).andReturn();

		JsonNode me = body(result);
		UUID id = UUID.fromString(me.path("organization").path("id").asString());
		assertThat(me.path("organization").path("name").asString()).isEqualTo("Mi espacio");
		assertThat(me.path("organization").path("timeZone").asString()).isEqualTo("Europe/Madrid");
		assertThat(me.path("organization").path("color").asString()).isEqualTo(OrganizationColors.forId(id));
		assertThat(me.path("organization").path("supportEmail").isNull()).isTrue();
		assertThat(me.path("role").asString()).isEqualTo("admin");
		assertThat(me.path("customerId").isNull()).isTrue();
		assertThat(me.path("user").path("id").asString()).isEqualTo(this.admin.toString());
		// Me trae el espacio nuevo en la lista, con su rol, su color y un miembro; y el cupo ya gastado.
		JsonNode created = null;
		for (JsonNode ref : me.path("organizations")) {
			if (id.toString().equals(ref.path("id").asString())) {
				created = ref;
			}
		}
		assertThat(created).isNotNull();
		assertThat(created.path("role").asString()).isEqualTo("admin");
		assertThat(created.path("memberCount").asInt()).isEqualTo(1);
		assertThat(created.path("color").asString()).isEqualTo(OrganizationColors.forId(id));
		assertThat(me.path("organizations").size()).isEqualTo(2);
		assertThat(me.path("organizationCreation").path("allowed").asBoolean()).isTrue();
		assertThat(me.path("organizationCreation").path("created").asInt()).isEqualTo(1);
		assertThat(me.path("organizationCreation").path("limit").asInt()).isEqualTo(3);

		// Lo que queda guardado: quién lo creó, los valores por defecto del esquema y una membresía de administrador.
		assertThat(this.jdbc.sql("""
				select created_by = ? and color = ? and first_response_target_minutes = 30 and next_ticket_number = 1
					and support_email is null and version = 0 and getting_started_done_at is null
				from organizations where id = ?
				""").params(this.admin, OrganizationColors.forId(id), id).query(Boolean.class).single()).isTrue();
		assertThat(this.jdbc.sql("""
				select role = 'admin' and status = 'active' and customer_id is null and joined_at = ?
				from memberships where organization_id = ? and user_id = ?
				""")
			.params(Timestamp.from(TestClockConfiguration.START.plus(Duration.ofHours(5))), id, this.admin)
			.query(Boolean.class)
			.single()).isTrue();
		assertThat(this.jdbc.sql("select count(*) from memberships where organization_id = ?")
			.param(id)
			.query(Integer.class)
			.single()).isEqualTo(1);

		// La sesión trabaja ya en el espacio nuevo; sin ella, la persona sigue en el suyo de siempre.
		this.mvc.perform(get(API + "/me").session(session).with(as(ADMIN)))
			.andExpect(jsonPath("$.organization.id").value(id.toString()))
			.andExpect(jsonPath("$.organizationCreation.created").value(1));
		this.mvc.perform(get(API + "/organization").session(session).with(as(ADMIN)))
			.andExpect(jsonPath("$.id").value(id.toString()))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30))
			.andExpect(jsonPath("$.color").value(OrganizationColors.forId(id)));
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void theNewWorkspaceStartsEmptyAndSeesNothingOfTheOthers() throws Exception {
		this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		MockHttpSession session = new MockHttpSession();
		UUID id = createdId(this.mvc.perform(createRequest(ADMIN, body("Vacío")).session(session)).andReturn());

		this.mvc.perform(get(API + "/tickets").session(session).with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
		this.mvc.perform(get(API + "/customers").session(session).with(as(ADMIN)))
			.andExpect(jsonPath("$.totalItems").value(0));
		JsonNode team = body(this.mvc.perform(get(API + "/members").session(session).with(as(ADMIN))).andReturn());
		assertThat(team.size()).isEqualTo(1);
		assertThat(team.get(0).path("id").asString()).isEqualTo(this.admin.toString());
		// El primer ticket del espacio nuevo es el número 1 y no choca con el de Acme.
		this.mvc.perform(get(API + "/organization").session(session).with(as(ADMIN)))
			.andExpect(jsonPath("$.id").value(id.toString()));
	}

	@Test
	void anAgentAndACustomerGetA403AndNothingIsCreated() throws Exception {
		int before = organizationCount();

		for (String user : List.of(LAURA, MARIA)) {
			this.mvc.perform(createRequest(user, body("No debería")))
				.andExpect(status().isForbidden())
				.andExpect(matchesContract("createOrganization"));
		}

		assertThat(organizationCount()).isEqualTo(before);
	}

	@Test
	void theBodyIsValidatedBeforeThePermissionSoAnAgentWithAnEmptyBodyGetsA400() throws Exception {
		this.mvc.perform(createRequest(LAURA, "{}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createOrganization"))
			.andExpect(jsonPath("$.errors[?(@.field == 'name')]").exists())
			.andExpect(jsonPath("$.errors[?(@.field == 'timeZone')]").exists());
	}

	@Test
	void anAdminWhoWorksAsACustomerInTheSessionCanStillCreate() throws Exception {
		// Ada administra Northwind y es clienta en Acme; la sesión trabaja ahora en Acme, con el rol de cliente.
		UUID customer = this.data.customer(this.acme, "Ada Cliente", NORTHWIND_ADMIN, "Acme");
		this.data.customerMembership(this.acme, this.northwindAdmin, customer);
		MockHttpSession session = new MockHttpSession();
		this.mvc.perform(post(API + "/session/organization").session(session)
			.with(as(NORTHWIND_ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + this.acme + "\"}")).andExpect(jsonPath("$.role").value("customer"));
		this.mvc.perform(get(API + "/me").session(session).with(as(NORTHWIND_ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(true));

		this.mvc.perform(createRequest(NORTHWIND_ADMIN, body("Desde cliente")).session(session))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.role").value("admin"));
	}

	@Test
	void meSaysWhoCanCreateWithoutTheClientRecomputingIt() throws Exception {
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(true))
			.andExpect(jsonPath("$.organizationCreation.created").value(0))
			.andExpect(jsonPath("$.organizationCreation.limit").value(3));
		for (String user : List.of(LAURA, MARIA)) {
			this.mvc.perform(get(API + "/me").with(as(user)))
				.andExpect(jsonPath("$.organizationCreation.allowed").value(false))
				.andExpect(jsonPath("$.organizationCreation.limit").value(3));
		}
		// Un administrador retirado ya no puede: la membresía tiene que estar activa.
		this.data.setMembershipStatus(this.northwind, this.northwindAdmin, "removed");
		this.data.membership(this.acme, this.northwindAdmin, "agent", "active");
		this.mvc.perform(get(API + "/me").with(as(NORTHWIND_ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(false));
	}

	@Test
	void theOrganizationHeaderIsIgnoredBecauseThisIsWhatChangesIt() throws Exception {
		this.mvc.perform(createRequest(ADMIN, body("Con cabecera")).header("X-Organization-Id", UUID.randomUUID().toString()))
			.andExpect(status().isCreated());
	}

	// --- Validación ---------------------------------------------------------------------------------------------

	@Test
	void validatesEachFieldAndCreatesNothing() throws Exception {
		int before = organizationCount();
		String zone = "\"America/Bogota\"";
		String[][] cases = {
				{ "{\"name\": \"\", \"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": \"   \", \"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": \"" + "x".repeat(121) + "\", \"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": \"con\\ncontrol\", \"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": null, \"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": 4, \"timeZone\": " + zone + "}", "name" },
				{ "{\"timeZone\": " + zone + "}", "name" },
				{ "{\"name\": \"Ok\", \"timeZone\": \"\"}", "timeZone" },
				{ "{\"name\": \"Ok\", \"timeZone\": \"UTC+5\"}", "timeZone" },
				{ "{\"name\": \"Ok\", \"timeZone\": \"Mars/Olympus\"}", "timeZone" },
				{ "{\"name\": \"Ok\", \"timeZone\": null}", "timeZone" },
				{ "{\"name\": \"Ok\"}", "timeZone" },
				{ "{\"name\": \"Ok\", \"timeZone\": " + zone + ", \"color\": \"blue\"}", "color" },
				{ "{\"name\": \"Ok\", \"timeZone\": " + zone + ", \"createdBy\": \"" + this.laura + "\"}", "createdBy" }, };
		for (String[] testCase : cases) {
			MvcResult result = this.mvc.perform(createRequest(ADMIN, testCase[0])).andReturn();
			assertThat(result.getResponse().getStatus()).as(testCase[0]).isEqualTo(400);
			matchesContract("createOrganization").match(result);
			assertThat(body(result).path("errors").toString()).as(testCase[0]).contains("\"field\":\"" + testCase[1] + "\"");
		}
		MvcResult noBody = this.mvc.perform(post(API + "/organizations").with(as(ADMIN))).andReturn();
		assertThat(noBody.getResponse().getStatus()).isEqualTo(400);
		MvcResult array = this.mvc.perform(createRequest(ADMIN, "[]")).andReturn();
		assertThat(array.getResponse().getStatus()).isEqualTo(400);
		assertThat(organizationCount()).isEqualTo(before);
	}

	@Test
	void acceptsTheLongestNameAndAccentedText() throws Exception {
		MvcResult result = create(ADMIN, "Ñ".repeat(120));
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(result).path("organization").path("name").asString()).hasSize(120);
	}

	// --- El límite ------------------------------------------------------------------------------------------------

	@Test
	void theFourthWorkspaceIsA409AndLeavingOneGivesTheSlotBack() throws Exception {
		UUID first = createdId(create(ADMIN, "Uno"));
		createdId(create(ADMIN, "Dos"));
		createdId(create(ADMIN, "Tres"));
		int before = organizationCount();

		MvcResult blocked = create(ADMIN, "Cuatro");

		assertThat(blocked.getResponse().getStatus()).isEqualTo(409);
		matchesContract("createOrganization").match(blocked);
		assertThat(body(blocked).path("type").asString()).isEqualTo(LIMIT_TYPE);
		assertThat(organizationCount()).isEqualTo(before);
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(false))
			.andExpect(jsonPath("$.organizationCreation.created").value(3))
			.andExpect(jsonPath("$.organizationCreation.limit").value(3));

		// Salir de uno que creó devuelve el cupo (la fila del espacio no se borra, pero ya no está activa en él). Solo
		// puede salir si queda otro administrador: quien lo creó es, al principio, el único.
		this.mvc.perform(delete(API + "/me/organizations/" + first).with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/last-admin"));
		this.data.staff(first, "admin", "Relevo", "relevo@uno.example");
		this.mvc.perform(delete(API + "/me/organizations/" + first).with(as(ADMIN)))
			.andExpect(status().isNoContent());
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(true))
			.andExpect(jsonPath("$.organizationCreation.created").value(2));
		createdId(create(ADMIN, "Cuatro"));
		assertThat(create(ADMIN, "Cinco").getResponse().getStatus()).isEqualTo(409);
	}

	@Test
	void workspacesYouWereInvitedToDoNotCountAndEachPersonHasTheirOwnCount() throws Exception {
		// Ada crea tres: Yelisson, administrador de Acme y de otro espacio que no creó, sigue pudiendo crear los suyos.
		for (String name : List.of("A1", "A2", "A3")) {
			createdId(create(NORTHWIND_ADMIN, name));
		}
		assertThat(create(NORTHWIND_ADMIN, "A4").getResponse().getStatus()).isEqualTo(409);
		this.data.membership(this.northwind, this.admin, "admin", "active");
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.created").value(0))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(true));
		createdId(create(ADMIN, "Y1"));
		createdId(create(ADMIN, "Y2"));
		createdId(create(ADMIN, "Y3"));
		assertThat(create(ADMIN, "Y4").getResponse().getStatus()).isEqualTo(409);
	}

	@Test
	@Timeout(30)
	void twoSimultaneousCreationsWithOneSlotLeftCreateExactlyOne() throws Exception {
		createdId(create(ADMIN, "Uno"));
		createdId(create(ADMIN, "Dos"));
		CountDownLatch go = new CountDownLatch(1);
		Callable<MvcResult> attempt = () -> {
			go.await();
			return create(ADMIN, "Carrera");
		};
		Future<MvcResult> first = this.executor.submit(attempt);
		Future<MvcResult> second = this.executor.submit(attempt);
		go.countDown();

		MvcResult[] results = { first.get(WAIT_SECONDS, TimeUnit.SECONDS), second.get(WAIT_SECONDS, TimeUnit.SECONDS) };

		List<Integer> statuses = List.of(results[0].getResponse().getStatus(), results[1].getResponse().getStatus());
		assertThat(statuses).containsExactlyInAnyOrder(201, 409);
		for (MvcResult result : results) {
			matchesContract("createOrganization").match(result);
		}
		assertThat(this.jdbc.sql("select count(*) from organizations where created_by = ?")
			.param(this.admin)
			.query(Integer.class)
			.single()).isEqualTo(3);
	}

	/**
	 * La exactitud del límite descansa en el bloqueo por persona que comparte con salir de un espacio. Una carrera de
	 * hilos podría pasar sin él por suerte; con el bloqueo retenido desde fuera, en cambio, crear tiene que esperarlo.
	 */
	@Test
	@Timeout(30)
	void creatingWaitsForThePerPersonLockThatLeavingAlsoTakes() throws Exception {
		Future<MvcResult> creation;
		try (RowLock lock = RowLock.hold(this.dataSource, "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
				"user-memberships:" + this.admin)) {
			creation = this.executor.submit(() -> create(ADMIN, "Espera"));
			awaitWaitingForALock(creation);
			assertThat(creation.isDone()).as("crear no espera el bloqueo por persona").isFalse();
			assertThat(this.jdbc.sql("select count(*) from organizations where created_by = ?")
				.param(this.admin)
				.query(Integer.class)
				.single()).isZero();
		}

		assertThat(creation.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
	}

	private void awaitWaitingForALock(Future<?> request) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(WAIT_SECONDS).toNanos();
		while (System.nanoTime() < deadline) {
			if (request.isDone() || this.jdbc.sql("""
					select count(*) from pg_stat_activity
					where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
					""").query(Integer.class).single() > 0) {
				return;
			}
			Thread.sleep(10);
		}
		throw new TimeoutException("La petición ni esperó un bloqueo ni terminó");
	}

}
