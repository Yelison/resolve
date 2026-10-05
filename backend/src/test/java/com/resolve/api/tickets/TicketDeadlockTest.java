package com.resolve.api.tickets;

import java.sql.SQLException;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * Un interbloqueo real llega por JPA como la misma {@link CannotAcquireLockException} que el tope de espera, y solo
 * el SQLSTATE los distingue: 40P01 frente a 55P03. {@code ApiExceptionHandler} depende de ello.
 */
class TicketDeadlockTest extends TicketsFixture {

	private static final String LOCK_TICKET = "select id from tickets where organization_id = ? and number = ? for no key update";

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private TicketRepository tickets;

	@Autowired
	private TransactionTemplate transaction;

	@Test
	void aRealDeadlockIsACannotAcquireLockExceptionWithSqlState40P01() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Uno", "urgent", null);
		createTicket(LAURA, this.mariaCustomer, "Dos", "urgent", null);
		ExecutorService executor = Executors.newSingleThreadExecutor();
		try (RowLock other = RowLock.hold(this.dataSource, LOCK_TICKET, this.acme, 1)) {
			// La víctima es quien comprueba el ciclo primero: la otra conexión espera mucho más que la aplicación.
			other.run("set local deadlock_timeout = '30s'");
			Throwable thrown = catchThrowable(() -> this.transaction.executeWithoutResult((status) -> {
				// La aplicación toma el #2 y pide el #1 (que tiene la otra conexión). Cuando ya está esperando, la otra
				// conexión pide el #2 y cierra el ciclo. Con deadlock_timeout más corto en la aplicación, es ella
				// quien detecta el ciclo y la víctima que elige PostgreSQL.
				this.jdbc.sql("set local deadlock_timeout = '300ms'").update();
				this.tickets.lockInOrganization(this.acme, 2);
				Future<?> closing = executor.submit(() -> {
					awaitWaiter();
					other.alsoLock(LOCK_TICKET, this.acme, 2);
					return null;
				});
				this.tickets.lockInOrganization(this.acme, 1);
				closing.cancel(true);
			}));

			assertThat(thrown).isInstanceOf(CannotAcquireLockException.class);
			assertThat(sqlState(thrown)).isEqualTo("40P01");
		}
		finally {
			executor.shutdownNow();
			executor.awaitTermination(10, TimeUnit.SECONDS);
		}
	}

	private void awaitWaiter() {
		long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
		while (System.nanoTime() < deadline) {
			Integer waiters = this.jdbc.sql("""
					select count(*) from pg_stat_activity
					where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
					""").query(Integer.class).single();
			if (waiters > 0) {
				return;
			}
			try {
				Thread.sleep(10);
			}
			catch (InterruptedException exception) {
				Thread.currentThread().interrupt();
				throw new IllegalStateException(exception);
			}
		}
		throw new IllegalStateException("La otra conexión no llegó a esperar el bloqueo");
	}

	private static String sqlState(Throwable thrown) {
		for (Throwable cause = thrown; cause != null; cause = cause.getCause()) {
			if (cause instanceof SQLException sql) {
				return sql.getSQLState();
			}
		}
		return null;
	}

}
