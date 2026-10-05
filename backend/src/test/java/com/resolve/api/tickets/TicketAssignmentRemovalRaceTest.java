package com.resolve.api.tickets;

import java.time.Duration;
import java.util.UUID;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Una asignación que compite con la retirada del miembro no puede dejar un ticket sin resolver asignado a alguien
 * retirado. El PATCH queda aparcado con la fila del ticket y la membresía del nuevo responsable bloqueadas; la
 * retirada tiene que esperar a que confirme y entonces liberar también ese ticket. Sin el bloqueo de la membresía,
 * la retirada terminaría antes, no vería el ticket y el PATCH confirmaría después la asignación a un retirado.
 */
class TicketAssignmentRemovalRaceTest extends TicketsFixture {

	private static final int WAIT_SECONDS = 10;

	@Autowired
	private TicketUpdateBarrier barrier;

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
	void anAssignmentRacingARemovalNeverLeavesAnOpenTicketOnTheRemovedMember() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Asignación en carrera", "high", null);
		this.barrier.arm();

		Future<MvcResult> assign = this.executor.submit(() -> this.mvc
			.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(API + "/tickets/1")
				.with(as(LAURA))
				.header("If-Match", "\"0\"")
				.contentType(TicketsController.MERGE_PATCH_JSON)
				.content("{\"assigneeId\": \"%s\"}".formatted(this.daniel)))
			.andReturn());
		assertThat(this.barrier.awaitReached(WAIT_SECONDS)).as("el PATCH llegó al gancho").isTrue();
		Future<MvcResult> removal = this.executor
			.submit(() -> this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(ADMIN))).andReturn());
		awaitBlockedOrDone(removal);
		this.barrier.release();

		MvcResult assigned = assign.get(WAIT_SECONDS, TimeUnit.SECONDS);
		MvcResult removed = removal.get(WAIT_SECONDS, TimeUnit.SECONDS);
		assertThat(assigned.getResponse().getStatus()).isEqualTo(200);
		assertThat(removed.getResponse().getStatus()).isEqualTo(200);
		assertThat(unresolvedAssignedTo(this.daniel)).as("tickets sin resolver de quien fue retirado").isZero();
		assertThat(this.jdbc.sql("select status from memberships where user_id = ?")
			.param(this.daniel)
			.query(String.class)
			.single()).isEqualTo("removed");
	}

	@Test
	@Timeout(30)
	void anAssignmentAfterTheRemovalIsRejected() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Asignación tardía", "high", null);
		assertThat(this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(ADMIN)))
			.andReturn()
			.getResponse()
			.getStatus()).isEqualTo(200);
		MvcResult late = this.mvc
			.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(API + "/tickets/1")
				.with(as(LAURA))
				.header("If-Match", "\"0\"")
				.contentType(TicketsController.MERGE_PATCH_JSON)
				.content("{\"assigneeId\": \"%s\"}".formatted(this.daniel)))
			.andReturn();
		assertThat(late.getResponse().getStatus()).isEqualTo(400);
		assertThat(unresolvedAssignedTo(this.daniel)).isZero();
	}

	private int unresolvedAssignedTo(UUID userId) {
		return this.jdbc.sql("select count(*) from tickets where assignee_id = ? and status <> 'resolved'")
			.param(userId)
			.query(Integer.class)
			.single();
	}

	private void awaitBlockedOrDone(Future<?> other) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(WAIT_SECONDS).toNanos();
		while (System.nanoTime() < deadline) {
			if (other.isDone() || lockWaiters() > 0) {
				return;
			}
			Thread.sleep(10);
		}
		throw new TimeoutException("La retirada ni esperó un bloqueo ni terminó");
	}

	private int lockWaiters() {
		return this.jdbc.sql("""
				select count(*) from pg_stat_activity
				where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
				""").query(Integer.class).single();
	}

}
