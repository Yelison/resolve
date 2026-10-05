package com.resolve.api.common.web;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class UuidsTest {

	private static final String CANONICAL = "0192f000-0000-7000-8000-00000000abcd";

	@Test
	void acceptsTheCanonicalFormInLowerAndUpperCase() {
		UUID expected = UUID.fromString(CANONICAL);

		assertThat(Uuids.parse(CANONICAL)).contains(expected);
		assertThat(Uuids.parse(CANONICAL.toUpperCase())).contains(expected);
		assertThat(Uuids.parse("  " + CANONICAL + "\t")).contains(expected);
	}

	@Test
	void doesNotRequireVersionOrVariant() {
		assertThat(Uuids.parse("00000000-0000-0000-0000-000000000000")).isPresent();
		assertThat(Uuids.parse("ffffffff-ffff-ffff-ffff-ffffffffffff")).isPresent();
	}

	@ParameterizedTest
	@ValueSource(strings = { "", " ", "1-2-3-4-5", "no-es-un-uuid", "{0192f000-0000-7000-8000-00000000abcd}",
			"0192f00000007000800000000000abcd", "0192f000-0000-7000-8000-00000000abcde",
			"+192f000-0000-7000-8000-00000000abcd", "0192f000-0000-7000-8000-00000000abcg",
			"0192f000-0000-7000-8000-00000000abc\n", "٠192f000-0000-7000-8000-00000000abcd", "\u0000" + CANONICAL, CANONICAL + "\u0007",
			"\u0000\u001f" + CANONICAL + "\u0007", "\u001f" + CANONICAL })
	void rejectsEveryOtherForm(String value) {
		assertThat(Uuids.parse(value)).isEmpty();
	}

}
