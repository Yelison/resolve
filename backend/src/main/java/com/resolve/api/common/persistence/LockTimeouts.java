package com.resolve.api.common.persistence;

import org.springframework.dao.CannotAcquireLockException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Espera máxima por un bloqueo de fila. Va en {@code @QueryHints} de los finders con {@code PESSIMISTIC_WRITE} o
 * {@code PESSIMISTIC_READ}: Hibernate emite {@code set local lock_timeout} alrededor de la consulta, y al vencer
 * PostgreSQL responde 55P03, que Spring traduce a {@code CannotAcquireLockException} y la API a un 503 con
 * {@code Retry-After}. La pista no actúa sobre un {@code UPDATE} masivo: ahí se fija {@code set local lock_timeout}
 * con el mismo valor.
 *
 * <p>
 * Las transacciones que compiten son cortas y sin E/S externa (milisegundos), así que 3 s solo se alcanzan con una
 * transacción atascada; es menos que el tiempo de espera habitual de un cliente HTTP y bastante más que el de
 * cualquier espera normal, incluida la de los tests de concurrencia.
 */
public final class LockTimeouts {

	/** Nombre de la pista JPA estándar. */
	public static final String HINT = "jakarta.persistence.lock.timeout";

	/** Milisegundos, como texto porque una anotación solo admite constantes. */
	public static final String MILLIS = "3000";

	/** Segundos que se sugieren en {@code Retry-After}. */
	public static final int RETRY_AFTER_SECONDS = 1;

	private static final String LOCK_NOT_AVAILABLE = "55P03";

	private LockTimeouts() {
	}

	/**
	 * {@code set local lock_timeout} con {@link #MILLIS} para las sentencias que siguen en la transacción actual
	 * (también las de otras clases: el valor vale hasta el commit). Para un {@code UPDATE} masivo o una función de
	 * bloqueo (advisory lock), donde la pista JPA no actúa.
	 */
	public static void limitWait(JdbcClient jdbc) {
		jdbc.sql("select set_config('lock_timeout', ?, true)").param(MILLIS).query(String.class).single();
	}

	/**
	 * Toma un advisory lock de transacción ({@code pg_advisory_xact_lock}) con la espera acotada. Fija el tope antes,
	 * así que vale también para las sentencias que siguen en la transacción. {@code JdbcClient} no traduce el 55P03 de
	 * esta función como lo hace Hibernate con un finder: se convierte aquí en {@link CannotAcquireLockException} para
	 * que la API responda 503.
	 */
	public static void lockAdvisory(JdbcClient jdbc, String key) {
		limitWait(jdbc);
		try {
			jdbc.sql("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(hashtextextended(?, 0))) AS locked")
				.param(key)
				.query(Long.class)
				.single();
		}
		catch (UncategorizedSQLException ex) {
			if (ex.getSQLException() != null && LOCK_NOT_AVAILABLE.equals(ex.getSQLException().getSQLState())) {
				throw new CannotAcquireLockException("Tiempo de espera agotado por el bloqueo " + key, ex);
			}
			throw ex;
		}
	}

}
