package com.resolve.api.common.persistence;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.UUID;

/** Identificadores UUIDv7: ordenados por tiempo, lo que mantiene compactos los índices B-tree. */
public final class Ids {

	private static final SecureRandom RANDOM = new SecureRandom();

	private Ids() {
	}

	public static UUID newId() {
		return newId(Clock.systemUTC());
	}

	static UUID newId(Clock clock) {
		long millis = clock.millis();
		long randomA = RANDOM.nextLong();
		long randomB = RANDOM.nextLong();
		long mostSignificant = (millis << 16) | 0x7000L | (randomA & 0x0FFFL);
		long leastSignificant = (randomB & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
		return new UUID(mostSignificant, leastSignificant);
	}

}
