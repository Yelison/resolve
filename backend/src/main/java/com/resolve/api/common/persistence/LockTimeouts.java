package com.resolve.api.common.persistence;

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

	private LockTimeouts() {
	}

}
