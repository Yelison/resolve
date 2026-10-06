package com.resolve.api.common.web;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;

import com.resolve.api.support.ApiIntegrationTest;
import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Tres altas simultáneas con tope dos: como mucho dos filas y un 409. La tabla se retiene con un bloqueo, así que las
 * tres peticiones llegan a contar a la vez (sin el bloqueo de asesoramiento de {@link DemoLimits} las tres pasan) y se
 * liberan juntas. Sin esperas fijas: se espera a que haya tres sesiones bloqueadas en la base de datos.
 */
@TestPropertySource(properties = { "resolve.demo.limits=true", "resolve.demo.cap.tickets=2",
		"resolve.demo.cap.customers=2" })
class DemoLimitsRaceTest extends ApiIntegrationTest {

	private static final String ANA = "ana@acme.example";

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcClient jdbc;

	private final ExecutorService executor = Executors.newFixedThreadPool(3);

	private UUID acmeCustomer;

	@BeforeEach
	void seed() {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", ANA);
		this.acmeCustomer = this.data.customer(acme, "Cliente", "c@cliente.example", "A");
	}

	@AfterEach
	void stop() throws Exception {
		this.executor.shutdownNow();
		assertThat(this.executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
	}

	@Test
	@Timeout(60)
	void threeSimultaneousTicketsWithACapOfTwoCreateTwoAndRejectOne() throws Exception {
		List<Integer> statuses = race("tickets", (i) -> post(API + "/tickets").with(as(ANA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"customerId\": \"%s\", \"subject\": \"Asunto %d\", \"description\": \"Texto\"}"
				.formatted(this.acmeCustomer, i)));

		assertThat(statuses).containsExactlyInAnyOrder(201, 201, 409);
		assertThat(rows("tickets")).isEqualTo(2);
	}

	@Test
	@Timeout(60)
	void threeSimultaneousCustomersWithACapOfTwoCreateTwoAndRejectOne() throws Exception {
		// El cliente sembrado para los tickets se borra: con tope dos tienen que caber exactamente dos altas.
		this.jdbc.sql("DELETE FROM customers").update();
		List<Integer> statuses = race("customers", (i) -> post(API + "/customers").with(as(ANA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Nuevo %d\", \"email\": \"n%d@cliente.example\"}".formatted(i, i)));

		assertThat(statuses).containsExactlyInAnyOrder(201, 201, 409);
		assertThat(rows("customers")).isEqualTo(2);
	}

	private long rows(String table) {
		return this.jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
	}

	private List<Integer> race(String table,
			java.util.function.IntFunction<org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder> request)
			throws Exception {
		List<Future<Integer>> responses = new ArrayList<>();
		CountDownLatch start = new CountDownLatch(1);
		try (RowLock lock = RowLock.hold(this.dataSource, "select 1")) {
			// Bloquea las inserciones (no las lecturas): las tres peticiones cuentan antes de poder guardar.
			lock.run("LOCK TABLE " + table + " IN SHARE ROW EXCLUSIVE MODE");
			for (int i = 0; i < 3; i++) {
				int index = i;
				responses.add(this.executor.submit(() -> {
					start.await();
					return this.mvc.perform(request.apply(index)).andReturn().getResponse().getStatus();
				}));
			}
			start.countDown();
			awaitBlockedSessions(3);
		}
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> response : responses) {
			statuses.add(response.get(20, TimeUnit.SECONDS));
		}
		return statuses;
	}

	private void awaitBlockedSessions(int expected) throws InterruptedException {
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (System.nanoTime() < deadline) {
			Long blocked = this.jdbc
				.sql("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")
				.query(Long.class)
				.single();
			if (blocked >= expected) {
				return;
			}
			Thread.sleep(20);
		}
		throw new AssertionError("Las " + expected + " altas no llegaron a bloquearse");
	}

}
