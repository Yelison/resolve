package com.resolve.api.memberships;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;

import com.resolve.api.support.ApiAccess;
import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El alta abierta ({@code resolve.organizations.creation=open}, docs/decisions/0004-workspaces.md, fase 4a) contra la
 * cadena de {@code dev}/{@code test}: una identidad verificada sin ninguna membresía crea su primer espacio y nada más; el
 * agente y el cliente también pueden; el límite sigue valiendo (aquí 1, para probar la carrera de verdad: con 3, dos altas
 * a la vez pasarían las dos). El modo {@code admins} lo cubren {@code WorkspaceCreationTest} y la matriz de acceso.
 */
@TestPropertySource(properties = { "resolve.organizations.creation=open", "resolve.organizations.per-person-limit=1" })
class OpenWorkspaceCreationTest extends TeamFixture {

	private static final String NEW_PERSON = "nueva@gente.example";

	private static final String NO_MEMBERSHIP = "https://resolve.example/problems/no-membership";

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

	private int organizationCount() {
		return this.jdbc.sql("select count(*) from organizations").query(Integer.class).single();
	}

	private long usersNamed(String email) {
		return this.data.usersWithEmail(email);
	}

	// --- Quien entra sin cuenta ni espacio --------------------------------------------------------------------------

	@Test
	void aPersonWithNoAccountAndNoWorkspaceGetsTheProblemThatOffersCreatingOneAndTheCreationWorks() throws Exception {
		this.mvc.perform(get(API + "/me").with(as(NEW_PERSON)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.type").value(NO_MEMBERSHIP))
			.andExpect(jsonPath("$.canCreateOrganization").value(true))
			.andExpect(jsonPath("$.email").value(NEW_PERSON))
			.andExpect(jsonPath("$.name").value("nueva"));
		// Pedir la pantalla no crea nada: la cuenta nace con el alta.
		assertThat(usersNamed(NEW_PERSON)).isZero();
		int before = organizationCount();
		MockHttpSession session = new MockHttpSession();

		MvcResult result = this.mvc.perform(createRequest(NEW_PERSON, body("  Mi primer espacio ")).session(session))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createOrganization"))
			.andReturn();

		JsonNode me = body(result);
		UUID id = UUID.fromString(me.path("organization").path("id").asString());
		assertThat(me.path("organization").path("name").asString()).isEqualTo("Mi primer espacio");
		assertThat(me.path("role").asString()).isEqualTo("admin");
		assertThat(me.path("customerId").isNull()).isTrue();
		assertThat(me.path("user").path("email").asString()).isEqualTo(NEW_PERSON);
		assertThat(me.path("user").path("name").asString()).isEqualTo("nueva");
		assertThat(me.path("organizations").size()).isEqualTo(1);
		assertThat(me.path("organizations").get(0).path("id").asString()).isEqualTo(id.toString());
		assertThat(me.path("organizationCreation").path("created").asInt()).isEqualTo(1);
		assertThat(me.path("organizationCreation").path("limit").asInt()).isEqualTo(1);
		assertThat(me.path("organizationCreation").path("allowed").asBoolean()).isFalse();
		assertThat(organizationCount()).isEqualTo(before + 1);
		assertThat(usersNamed(NEW_PERSON)).isEqualTo(1);
		UUID user = UUID.fromString(me.path("user").path("id").asString());
		assertThat(this.jdbc.sql("select created_by = ? from organizations where id = ?")
			.params(user, id)
			.query(Boolean.class)
			.single()).isTrue();
		assertThat(this.jdbc.sql("""
				select count(*) from memberships
				where user_id = ? and organization_id = ? and role = 'admin' and status = 'active' and customer_id is null
				""").params(user, id).query(Integer.class).single()).isEqualTo(1);
		assertThat(this.jdbc.sql("select count(*) from memberships where user_id = ?")
			.param(user)
			.query(Integer.class)
			.single()).isEqualTo(1);
		// La sesión ya trabaja en el espacio nuevo y la persona es un miembro más, con el principal de siempre.
		this.mvc.perform(get(API + "/me").session(session).with(as(NEW_PERSON)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(id.toString()));
	}

	@Test
	void theNewWorkspaceSeesNothingOfTheOthers() throws Exception {
		this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		MockHttpSession session = new MockHttpSession();
		this.mvc.perform(createRequest(NEW_PERSON, body("Mío")).session(session)).andExpect(status().isCreated());

		this.mvc.perform(get(API + "/tickets").session(session).with(as(NEW_PERSON)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
		this.mvc.perform(get(API + "/customers").session(session).with(as(NEW_PERSON)))
			.andExpect(jsonPath("$.totalItems").value(0));
		JsonNode team = body(this.mvc.perform(get(API + "/members").session(session).with(as(NEW_PERSON))).andReturn());
		assertThat(team.size()).isEqualTo(1);
		assertThat(team.get(0).path("email").asString()).isEqualTo(NEW_PERSON);
		JsonNode me = body(this.mvc.perform(get(API + "/me").session(session).with(as(NEW_PERSON))).andReturn());
		assertThat(me.path("organizations").size()).isEqualTo(1);
		// Y Acme sigue sin ver nada de la persona nueva.
		JsonNode acmeTeam = body(this.mvc.perform(get(API + "/members").with(as(ADMIN))).andReturn());
		assertThat(acmeTeam.toString()).doesNotContain(NEW_PERSON);
	}

	@Test
	void anAccountThatAlreadyExistsWithoutMembershipsKeepsItsNameAndIsNotDuplicated() throws Exception {
		UUID user = this.data.user("Nueva Persona", "nueva.persona@demo.example");

		this.mvc.perform(get(API + "/me").with(as("Nueva.Persona@Demo.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.canCreateOrganization").value(true))
			.andExpect(jsonPath("$.name").value("Nueva Persona"));
		MvcResult result = this.mvc.perform(createRequest("Nueva.Persona@Demo.example", body("Demo")))
			.andExpect(status().isCreated())
			.andReturn();

		assertThat(body(result).path("user").path("id").asString()).isEqualTo(user.toString());
		assertThat(body(result).path("user").path("name").asString()).isEqualTo("Nueva Persona");
		assertThat(usersNamed("nueva.persona@demo.example")).isEqualTo(1);
	}

	@Test
	void theBodyIsValidatedFirstSoAnInvalidOneCreatesNeitherTheUserNorTheWorkspace() throws Exception {
		int before = organizationCount();

		this.mvc.perform(createRequest(NEW_PERSON, "{}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createOrganization"))
			.andExpect(jsonPath("$.errors[?(@.field == 'name')]").exists());

		assertThat(organizationCount()).isEqualTo(before);
		assertThat(usersNamed(NEW_PERSON)).isZero();
	}

	@Test
	void aRemovedMemberDoesNotGetInThroughTheOpenDoor() throws Exception {
		int before = organizationCount();

		this.mvc.perform(createRequest(REMOVED, body("Colado")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("createOrganization"))
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/access-deactivated"))
			.andExpect(jsonPath("$.canCreateOrganization").doesNotExist());

		assertThat(organizationCount()).isEqualTo(before);
	}

	// --- Quien ya es miembro ----------------------------------------------------------------------------------------

	@Test
	void anAgentAndACustomerCanCreateWhenItIsOpenAndMeSaysSo() throws Exception {
		for (String user : List.of(LAURA, MARIA)) {
			this.mvc.perform(get(API + "/me").with(as(user)))
				.andExpect(jsonPath("$.organizationCreation.allowed").value(true));
			MvcResult result = this.mvc.perform(createRequest(user, body("De " + user)))
				.andExpect(status().isCreated())
				.andExpect(matchesContract("createOrganization"))
				.andReturn();
			assertThat(body(result).path("role").asString()).isEqualTo("admin");
			assertThat(body(result).path("organizations").size()).isEqualTo(2);
		}
	}

	@Test
	void theLimitStillAppliesAndTheSecondCreationIsA409() throws Exception {
		assertThat(create(NEW_PERSON, "Uno").getResponse().getStatus()).isEqualTo(201);
		int before = organizationCount();

		MvcResult blocked = create(NEW_PERSON, "Dos");

		assertThat(blocked.getResponse().getStatus()).isEqualTo(409);
		matchesContract("createOrganization").match(blocked);
		assertThat(body(blocked).path("type").asString()).isEqualTo(LIMIT_TYPE);
		assertThat(organizationCount()).isEqualTo(before);
		this.mvc.perform(get(API + "/me").with(as(NEW_PERSON)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(false));
	}

	// --- Simultaneidad ----------------------------------------------------------------------------------------------

	@Test
	@Timeout(30)
	void twoSimultaneousCreationsOfAPersonWithoutWorkspaceCreateExactlyOneWhateverTheirAccountState() throws Exception {
		// Una con cuenta sin membresías y otra sin cuenta: las dos esperan lo mismo (una creación y un 409).
		this.data.user("Con Cuenta", "concuenta@gente.example");
		for (String email : List.of("concuenta@gente.example", "sincuenta@gente.example")) {
			CountDownLatch go = new CountDownLatch(1);
			Callable<MvcResult> attempt = () -> {
				go.await();
				return create(email, "Carrera");
			};
			Future<MvcResult> first = this.executor.submit(attempt);
			Future<MvcResult> second = this.executor.submit(attempt);
			go.countDown();

			List<Integer> statuses = List.of(first.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus(),
					second.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus());

			assertThat(statuses).as(email).containsExactlyInAnyOrder(201, 409);
			assertThat(usersNamed(email)).as(email).isEqualTo(1);
			assertThat(this.jdbc.sql("select count(*) from organizations o join users u on u.id = o.created_by where lower(u.email) = ?")
				.param(email)
				.query(Integer.class)
				.single()).as(email).isEqualTo(1);
		}
	}

	/**
	 * Con una cuenta que ya existe, el único freno entre dos altas a la vez es el bloqueo por persona (con un correo nuevo,
	 * la segunda espera además en el índice único de {@code users}, y la carrera no probaría el bloqueo). Retenido desde
	 * fuera, crear tiene que esperarlo.
	 */
	@Test
	@Timeout(30)
	void creatingForAPersonWithoutWorkspaceWaitsForThePerPersonLock() throws Exception {
		UUID user = this.data.user("Con Cuenta", "concuenta@gente.example");
		Future<MvcResult> creation;
		try (RowLock lock = RowLock.hold(this.dataSource, "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
				"user-memberships:" + user)) {
			creation = this.executor.submit(() -> create("concuenta@gente.example", "Espera"));
			awaitWaitingForALock(creation);
			assertThat(creation.isDone()).as("crear no espera el bloqueo por persona").isFalse();
			assertThat(this.jdbc.sql("select count(*) from organizations where created_by = ?")
				.param(user)
				.query(Integer.class)
				.single()).isZero();
		}

		assertThat(creation.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
	}

	private void awaitWaitingForALock(Future<?> request) throws Exception {
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(WAIT_SECONDS);
		while (System.nanoTime() < deadline) {
			if (request.isDone() || this.jdbc.sql("""
					select count(*) from pg_stat_activity
					where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
					""").query(Integer.class).single() > 0) {
				return;
			}
			Thread.sleep(10);
		}
		throw new java.util.concurrent.TimeoutException("La petición ni esperó un bloqueo ni terminó");
	}

	// --- Solo esa ruta ------------------------------------------------------------------------------------------------

	@Test
	void anIdentityWithoutMembershipsReachesCreateOrganizationAndNoOtherOperationOfTheContract() throws Exception {
		int before = organizationCount();

		assertThat(ApiAccess.identityWithoutMembershipViolations(this.mvc, as(NEW_PERSON), NEW_PERSON, true)).isEmpty();

		// El recorrido llamó a createOrganization con el cuerpo vacío: un 400 que no creó nada, ni la cuenta.
		assertThat(organizationCount()).isEqualTo(before);
		assertThat(usersNamed(NEW_PERSON)).isZero();
	}

}
