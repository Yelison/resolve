package com.resolve.api.tickets;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pruebas con hilos reales sobre PostgreSQL: numeración, ediciones simultáneas y mensajes que llegan mientras un
 * PATCH tiene la fila. El orden lo fuerzan {@link TicketUpdateBarrier} y las esperas de bloqueo de la base, no los
 * {@code sleep}; todas las esperas tienen tope para no dejar una transacción abierta que cuelgue el siguiente test.
 */
class TicketConcurrencyTest extends TicketsFixture {

	private static final int WAIT_SECONDS = 10;

	@Autowired
	private TicketUpdateBarrier barrier;

	@Autowired
	private JdbcClient jdbc;

	private final ExecutorService executor = Executors.newFixedThreadPool(8);

	@AfterEach
	void releaseEverything() throws Exception {
		// Una transacción aparcada mantiene su bloqueo y el TRUNCATE del siguiente test esperaría para siempre.
		this.barrier.disarm();
		this.executor.shutdownNow();
		assertThat(this.executor.awaitTermination(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
	}

	@Test
	@Timeout(30)
	void concurrentCreationsGetDistinctConsecutiveNumbers() throws Exception {
		int threads = 8;
		CountDownLatch start = new CountDownLatch(1);
		List<Future<MvcResult>> responses = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			String body = """
					{"customerId": "%s", "subject": "Alta simultánea %d", "description": "Detalle", "priority": "medium"}
					""".formatted(this.mariaCustomer, i);
			responses.add(this.executor.submit(() -> {
				start.await();
				return this.mvc
					.perform(post("/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content(body))
					.andReturn();
			}));
		}
		start.countDown();

		List<Long> numbers = new ArrayList<>();
		for (Future<MvcResult> response : responses) {
			MvcResult result = response.get(WAIT_SECONDS, TimeUnit.SECONDS);
			status().isCreated().match(result);
			matchesContract("createTicket").match(result);
			numbers.add(JSON.readTree(result.getResponse().getContentAsString()).get("number").asLong());
		}
		assertThat(numbers).containsExactlyInAnyOrder(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
		assertThat(this.jdbc.sql("select next_ticket_number from organizations where id = ?")
			.param(this.acme)
			.query(Long.class)
			.single()).isEqualTo(9L);
	}

	@Test
	@Timeout(30)
	void twoConcurrentPatchesWithTheSameVersionYieldOne200AndOne412() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "No puedo acceder a mi cuenta", "urgent", this.laura);
		int activityBefore = activityCount();
		this.barrier.arm();

		CountDownLatch start = new CountDownLatch(1);
		Future<MvcResult> status = this.executor.submit(() -> {
			start.await();
			return patchWithVersion(LAURA, 0, "{\"status\": \"in_progress\"}");
		});
		Future<MvcResult> priority = this.executor.submit(() -> {
			start.await();
			return patchWithVersion(DANIEL, 0, "{\"priority\": \"low\"}");
		});
		start.countDown();

		// Uno llega al gancho y se aparca. El otro, con el bloqueo de fila, espera en el SELECT … FOR UPDATE; sin
		// bloqueo termina antes de que el primero se suelte. Se suelta cuando uno de los dos casos ya ocurrió.
		assertThat(this.barrier.awaitReached(WAIT_SECONDS)).as("un PATCH llegó al gancho").isTrue();
		awaitOtherBlockedOrDone(status, priority);
		this.barrier.release();

		MvcResult statusResult = status.get(WAIT_SECONDS, TimeUnit.SECONDS);
		MvcResult priorityResult = priority.get(WAIT_SECONDS, TimeUnit.SECONDS);
		List<MvcResult> results = List.of(statusResult, priorityResult);
		assertThat(results.stream().filter((r) -> r.getResponse().getStatus() == 200)).hasSize(1);
		assertThat(results.stream().filter((r) -> r.getResponse().getStatus() == 412)).hasSize(1);
		for (MvcResult result : results) {
			matchesContract("updateTicket").match(result);
		}

		boolean statusWon = statusResult.getResponse().getStatus() == 200;
		JsonNode ticket = JSON.readTree(this.mvc.perform(get("/tickets/1").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString());
		assertThat(ticket.get("version").asLong()).isEqualTo(1);
		assertThat(ticket.get("status").asString()).isEqualTo(statusWon ? "in_progress" : "open");
		assertThat(ticket.get("priority").asString()).isEqualTo(statusWon ? "urgent" : "low");
		assertThat(activityCount()).isEqualTo(activityBefore + 1);
	}

	private MvcResult patchWithVersion(String user, long version, String body) throws Exception {
		return this.mvc
			.perform(patch("/tickets/1").with(as(user))
				.contentType(TicketsController.MERGE_PATCH_JSON)
				.header("If-Match", "\"" + version + "\"")
				.content(body))
			.andReturn();
	}

	private int activityCount() {
		return this.jdbc.sql("select count(*) from ticket_activities").query(Integer.class).single();
	}

	/** Espera hasta que algún backend espere un bloqueo o el otro PATCH termine. */
	private void awaitOtherBlockedOrDone(Future<?> first, Future<?> second) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(WAIT_SECONDS).toNanos();
		while (System.nanoTime() < deadline) {
			if (first.isDone() || second.isDone() || lockWaiters() > 0) {
				return;
			}
			Thread.sleep(10);
		}
		throw new TimeoutException("Ningún PATCH quedó esperando ni terminó");
	}

	private int lockWaiters() {
		return this.jdbc.sql("""
				select count(*) from pg_stat_activity
				where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
				""").query(Integer.class).single();
	}

}
