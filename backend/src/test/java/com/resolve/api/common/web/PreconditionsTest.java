package com.resolve.api.common.web;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.PreconditionRequiredException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PreconditionsTest {

	@Test
	void readsTheVersionOfASingleStrongValidator() {
		assertThat(Preconditions.requireVersion("\"3\"", "cliente")).isEqualTo(3);
		assertThat(Preconditions.requireVersion("  \"0\" ", "cliente")).isZero();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "  " })
	void aMissingHeaderIsAPreconditionRequiredThatNamesTheResource(String ifMatch) {
		assertThatThrownBy(() -> Preconditions.requireVersion(ifMatch, "cliente"))
			.isInstanceOf(PreconditionRequiredException.class)
			.hasMessage("Envía If-Match con la versión del cliente que estás editando.");
	}

	@ParameterizedTest
	@ValueSource(strings = { "W/\"3\"", "*", "\"1\", \"2\"", "3", "\"abc\"", "\"\"" })
	void weakListWildcardAndMalformedValidatorsAreRejectedAsFieldErrors(String ifMatch) {
		assertThatThrownBy(() -> Preconditions.requireVersion(ifMatch, "cliente"))
			.isInstanceOfSatisfying(ApiValidationException.class, (exception) -> {
				assertThat(exception.errors()).singleElement().satisfies((error) -> {
					assertThat(error.field()).isEqualTo("If-Match");
					assertThat(error.message()).isEqualTo("Envía la versión entre comillas, como en la cabecera ETag.");
				});
			});
	}

}
