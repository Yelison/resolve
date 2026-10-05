package com.resolve.api.memberships;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;

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
