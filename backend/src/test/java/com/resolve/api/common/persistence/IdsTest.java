package com.resolve.api.common.persistence;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Los ids generados en la misma instancia salen en orden estricto de creación, también dentro del milisegundo. */
class IdsTest {

	private static final Clock FIXED = Clock.fixed(Instant.parse("2026-10-05T10:15:30.123Z"), ZoneOffset.UTC);

	@Test
	void idsOfTheSameMillisecondAreStrictlyIncreasing() {
		// Más que los 4096 valores del contador de 12 bits: obliga a pasar al milisegundo siguiente sin perder el orden.
		List<UUID> ids = generate(FIXED, 10_000);

		assertStrictlyIncreasing(ids);
	}

	@Test
	void idsKeepVersionSevenAndTheRfcVariant() {
		for (UUID id : generate(FIXED, 5_000)) {
			assertThat(id.version()).isEqualTo(7);
			assertThat(id.variant()).isEqualTo(2);
		}
	}

	@Test
	void theTimestampIsTheClockMillisecondWhileTheCounterDoesNotOverflow() {
		UUID id = new Ids.Generator().next(FIXED);

		assertThat(id.getMostSignificantBits() >>> 16).isEqualTo(FIXED.millis());
	}

	@Test
	void aClockThatGoesBackwardsDoesNotBreakTheOrder() {
		Clock later = Clock.fixed(FIXED.instant().plusMillis(5), ZoneOffset.UTC);
		Ids.Generator generator = new Ids.Generator();
		List<UUID> ids = new ArrayList<>(generate(generator, later, 3));
		ids.addAll(generate(generator, FIXED, 3));

		assertStrictlyIncreasing(ids);
	}

	@Test
	void idsOfLaterMillisecondsAreGreater() {
		Ids.Generator generator = new Ids.Generator();
		UUID first = generator.next(FIXED);
		UUID second = generator.next(Clock.fixed(FIXED.instant().plusMillis(1), ZoneOffset.UTC));

		assertThat(second.toString()).isGreaterThan(first.toString());
	}

	/** PostgreSQL ordena los uuid byte a byte: igual que el texto canónico en minúsculas. */
	private static void assertStrictlyIncreasing(List<UUID> ids) {
		for (int index = 1; index < ids.size(); index++) {
			assertThat(ids.get(index).toString()).isGreaterThan(ids.get(index - 1).toString());
		}
	}

	private static List<UUID> generate(Clock clock, int count) {
		return generate(new Ids.Generator(), clock, count);
	}

	private static List<UUID> generate(Ids.Generator generator, Clock clock, int count) {
		List<UUID> ids = new ArrayList<>(count);
		for (int index = 0; index < count; index++) {
			ids.add(generator.next(clock));
		}
		return ids;
	}

}
