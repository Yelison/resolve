package com.resolve.api.memberships;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;

/**
 * Foco de revisión 2 con hilos reales sobre PostgreSQL: dos administradores que se retiran o se degradan a la vez no
 * pueden dejar la organización sin administrador. Con un solo hilo la regla no se puede romper (quien actúa es un
 * administrador activo), así que el test aparca la primera operación después de su comprobación y lanza la segunda;
 * sin la exclusión mutua del equipo las dos pasarían la comprobación y confirmarían.
 */
class MemberConcurrencyTest extends TeamFixture {

	private static final int WAIT_SECONDS = 10;

	@Autowired
	private MemberGuardBarrier barrier;

	@Autowired
	private JdbcClient jdbc;

	private final ExecutorService executor = Executors.newFixedThreadPool(4);

	@AfterEach
	void releaseEverything() throws Exception {
		this.barrier.disarm();
		this.executor.shutdownNow();
		assertThat(this.executor.awaitTermination(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
	}

	@Test
	@Timeout(30)
	void twoAdminsRemovingEachOtherLeaveExactlyOneActiveAdmin() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		MvcResult[] results = race(() -> remove(ADMIN, second), () -> remove("segunda@acme.example", this.admin));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(200);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		matchesContract("removeMember").match(results[0]);
		matchesContract("removeMember").match(results[1]);
		assertThat(body(results[1]).path("detail").asString())
			.isEqualTo("La organización debe conservar al menos un administrador activo.");
		assertThat(body(results[1]).path("type").asString()).isEqualTo("https://resolve.example/problems/last-admin");
		assertThat(this.data.membershipStatus(this.acme, second)).isEqualTo("removed");
		// El que perdió sigue intacto.
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
		assertThat(activeAdmins()).isEqualTo(1);
	}

	@Test
	@Timeout(30)
	void twoAdminsDemotingEachOtherLeaveExactlyOneActiveAdmin() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		MvcResult[] results = race(() -> changeRole(ADMIN, second, "agent"),
				() -> changeRole("segunda@acme.example", this.admin, "agent"));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(200);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		matchesContract("changeMemberRole").match(results[0]);
		matchesContract("changeMemberRole").match(results[1]);
		assertThat(body(results[1]).path("type").asString()).isEqualTo("https://resolve.example/problems/last-admin");
		assertThat(activeAdmins()).isEqualTo(1);
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
	}

	@Test
	@Timeout(30)
	void aRemovalAndADemotionOfTheOtherAdminCannotBothSucceed() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		// La primera retira a la otra administradora y la segunda degrada a la primera: mezcla de las dos operaciones.
		MvcResult[] results = race(() -> remove(ADMIN, second),
				() -> changeRole("segunda@acme.example", this.admin, "agent"));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(200);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		assertThat(activeAdmins()).isEqualTo(1);
	}

	@Test
	@Timeout(30)
	void twoAdminsLeavingTogetherLeaveExactlyOneActiveAdmin() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		// Cada una tiene otro espacio, para que la regla que decida sea la del último administrador.
		this.data.membership(this.northwind, this.admin, "agent", "active");
		this.data.membership(this.northwind, second, "agent", "active");
		MvcResult[] results = race(() -> leave(ADMIN, this.acme), () -> leave("segunda@acme.example", this.acme));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(204);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		matchesContract("leaveOrganization").match(results[0]);
		matchesContract("leaveOrganization").match(results[1]);
		assertThat(body(results[1]).path("type").asString()).isEqualTo("https://resolve.example/problems/last-admin");
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("removed");
		// La que perdió sigue intacta y es la última.
		assertThat(this.data.membershipStatus(this.acme, second)).isEqualTo("active");
		assertThat(activeAdmins()).isEqualTo(1);
	}

	@Test
	@Timeout(30)
	void aLeaveAndTheOtherAdminsOwnDemotionCannotBothSucceed() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		this.data.membership(this.northwind, this.admin, "agent", "active");
		MvcResult[] results = race(() -> leave(ADMIN, this.acme),
				() -> changeRole("segunda@acme.example", second, "agent"));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(204);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		assertThat(body(results[1]).path("type").asString()).isEqualTo("https://resolve.example/problems/last-admin");
		assertThat(activeAdmins()).isEqualTo(1);
	}

	@Test
	@Timeout(30)
	void aLeaveAndARemovalOfTheOtherAdminCannotBothSucceed() throws Exception {
		UUID second = this.data.staff(this.acme, "admin", "Segunda Admin", "segunda@acme.example");
		this.data.membership(this.northwind, second, "agent", "active");
		// La segunda sale mientras la primera intenta retirarla: tras la salida, la retirada encuentra a la segunda ya
		// retirada (409 de estado, no el del último administrador) y la primera sigue activa.
		MvcResult[] results = race(() -> leave("segunda@acme.example", this.acme), () -> remove(ADMIN, second));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(204);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		assertThat(body(results[1]).path("detail").asString()).isEqualTo("El miembro ya fue retirado del equipo.");
		assertThat(activeAdmins()).isEqualTo(1);
		assertThat(this.data.membershipStatus(this.acme, this.admin)).isEqualTo("active");
	}

	@Test
	@Timeout(30)
	void aRemovalWinsOverTheLeaveOfTheSamePersonWaitingForTheTeamLock() throws Exception {
		// Daniel tiene otro espacio, para que lo que decida sea la retirada y no la regla del único espacio.
		this.data.membership(this.northwind, this.daniel, "agent", "active");
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		this.data.assignTicket(ticket, this.daniel);
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(1)));

		// El administrador retira a Daniel y queda aparcado con el bloqueo del equipo; Daniel sale mientras tanto.
		MvcResult[] results = race(() -> remove(ADMIN, this.daniel), () -> leave(DANIEL, this.acme));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(200);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(404);
		matchesContract("removeMember").match(results[0]);
		matchesContract("leaveOrganization").match(results[1]);
		// La fecha es la de la retirada y la liberación de tickets se hizo una sola vez.
		assertThat(this.jdbc.sql("select removed_at from memberships where organization_id = ? and user_id = ?")
			.params(this.acme, this.daniel)
			.query(java.sql.Timestamp.class)
			.single()
			.toInstant()).isEqualTo(TestClockConfiguration.START.plus(Duration.ofHours(1)));
		assertThat(this.jdbc.sql("select count(*) from ticket_activities where ticket_id = ? and type = 'assignee_changed'")
			.param(ticket)
			.query(Integer.class)
			.single()).isEqualTo(1);
	}

	@Test
	@Timeout(30)
	void twoLeavesOfTheSamePersonFromDifferentOrganizationsLeaveExactlyOne() throws Exception {
		this.data.membership(this.northwind, this.laura, "agent", "active");
		MvcResult[] results = race(() -> leave(LAURA, this.acme), () -> leave(LAURA, this.northwind));

		assertThat(results[0].getResponse().getStatus()).isEqualTo(204);
		assertThat(results[1].getResponse().getStatus()).isEqualTo(409);
		matchesContract("leaveOrganization").match(results[0]);
		matchesContract("leaveOrganization").match(results[1]);
		assertThat(body(results[1]).path("type").asString()).isEqualTo("https://resolve.example/problems/last-organization");
		assertThat(this.data.membershipStatus(this.acme, this.laura)).isEqualTo("removed");
		assertThat(this.data.membershipStatus(this.northwind, this.laura)).isEqualTo("active");
		assertThat(this.jdbc.sql("select count(*) from memberships where user_id = ? and status <> 'removed'")
			.param(this.laura)
			.query(Integer.class)
			.single()).isEqualTo(1);
	}

	private MvcResult leave(String asUser, UUID organizationId) throws Exception {
		return this.mvc.perform(delete(API + "/me/organizations/" + organizationId).with(as(asUser))).andReturn();
	}

	/**
	 * Aparca la primera operación tras su comprobación, lanza la segunda y espera a que o bien termine (sin
	 * exclusión mutua) o bien quede esperando un bloqueo; después suelta la primera y recoge ambos resultados.
	 */
	private MvcResult[] race(Callable<MvcResult> first, Callable<MvcResult> second) throws Exception {
		this.barrier.arm();
		Future<MvcResult> parked = this.executor.submit(first);
		assertThat(this.barrier.awaitReached(WAIT_SECONDS)).as("la primera operación llegó al gancho").isTrue();
		Future<MvcResult> late = this.executor.submit(second);
		awaitBlockedOrDone(late);
		this.barrier.release();
		return new MvcResult[] { parked.get(WAIT_SECONDS, TimeUnit.SECONDS), late.get(WAIT_SECONDS, TimeUnit.SECONDS) };
	}

	private void awaitBlockedOrDone(Future<?> late) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(WAIT_SECONDS).toNanos();
		while (System.nanoTime() < deadline) {
			if (late.isDone() || lockWaiters() > 0) {
				return;
			}
			Thread.sleep(10);
		}
		throw new TimeoutException("La segunda operación ni esperó un bloqueo ni terminó");
	}

	private int lockWaiters() {
		return this.jdbc.sql("""
				select count(*) from pg_stat_activity
				where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
				""").query(Integer.class).single();
	}

	private int activeAdmins() {
		return this.jdbc.sql("select count(*) from memberships where organization_id = ? and role = 'admin' and status = 'active'")
			.param(this.acme)
			.query(Integer.class)
			.single();
	}

}
