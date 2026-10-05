package com.resolve.api.common.persistence;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.UUID;

/**
 * Identificadores UUIDv7: ordenados por tiempo, lo que mantiene compactos los índices B-tree.
 *
 * <p>
 * Son además monótonos dentro de la instancia: los 12 bits que siguen a la versión llevan un contador (método 1 del
 * RFC 9562, sección 6.2), de modo que dos ids pedidos en el mismo milisegundo salen en el orden de la petición. Los
 * desempates por {@code id} del historial y de la conversación de un ticket dependen de ello.
 */
public final class Ids {

	private static final Generator SYSTEM = new Generator();

	private Ids() {
	}

	public static UUID newId() {
		return SYSTEM.next(Clock.systemUTC());
	}

	/** Generador con su propio contador: los tests lo crean nuevo para no heredar el estado del reloj real. */
	static final class Generator {

		private static final SecureRandom RANDOM = new SecureRandom();

		private static final int COUNTER_MASK = 0x0FFF;

		/** El contador de cada milisegundo nuevo arranca en la mitad baja, para dejar margen antes de desbordar. */
		private static final int COUNTER_START_BOUND = 0x0800;

		private long lastMillis;

		private int counter;

		UUID next(Clock clock) {
			long millis;
			int sequence;
			synchronized (this) {
				long now = clock.millis();
				if (now > this.lastMillis) {
					this.lastMillis = now;
					this.counter = RANDOM.nextInt(COUNTER_START_BOUND);
				}
				else if (this.counter < COUNTER_MASK) {
					// Mismo milisegundo, o un reloj que retrocede: se conserva el último y el contador sigue.
					this.counter++;
				}
				else {
					// Contador agotado: el milisegundo lógico avanza para no repetir ni desordenar.
					this.lastMillis++;
					this.counter = RANDOM.nextInt(COUNTER_START_BOUND);
				}
				millis = this.lastMillis;
				sequence = this.counter;
			}
			long randomB = RANDOM.nextLong();
			long mostSignificant = (millis << 16) | 0x7000L | sequence;
			long leastSignificant = (randomB & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
			return new UUID(mostSignificant, leastSignificant);
		}

	}

}
