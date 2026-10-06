package com.resolve.api.memberships;

import java.util.List;
import java.util.UUID;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Cada campo de los cuerpos del equipo y de la sesión, por separado: los ids se leen con {@code Uuids.parse} y el
 * texto rechaza los caracteres de control. El resto de la validación (tipos, longitud, formato) la cubren los tests de
 * la API.
 */
class MemberRequestParserTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String ID = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

	private static final String CONTROLS = "No admite caracteres de control.";

	/**
	 * NUL dentro y en los extremos; escape, DEL, salto de línea y tabulador solo dentro: {@code strip()} quita de los
	 * extremos el salto de línea y el tabulador.
	 */
	private static final String[] CONTROL_TEXTS = { "Ana\\u0000Gómez", "\\u0000Ana", "Ana\\u0000", "Ana\\u001bGómez",
			"Ana\\nGómez", "Ana\\tGómez", "Ana\\u007fGómez" };

	@ParameterizedTest
	@ValueSource(strings = { "1-2-3-4-5", "3f2b8c1e5d4a4e6f9a7b1c2d3e4f5a6b", "{3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b}",
			ID + "\u0000", "\u0000" + ID, ID + "\u000b", "", "no-es-un-uuid" })
	void userIdRejectsAnythingButACanonicalUuid(String value) {
		assertThatThrownBy(() -> MemberRequestParser.userId(value)).isInstanceOfSatisfying(ApiValidationException.class,
				(exception) -> assertThat(exception.errors()).containsExactly(
						new FieldErrorDetail("userId", "Debe ser un identificador de miembro válido.")));
	}

	@Test
	void userIdAcceptsACanonicalUuidWithSurroundingWhitespaceInEitherCase() {
		assertThat(MemberRequestParser.userId(" \t" + ID.toUpperCase() + "\r\n")).isEqualTo(UUID.fromString(ID));
	}

	@ParameterizedTest
	@ValueSource(strings = { "1-2-3-4-5", ID + "\\u0000", "\\u0000" + ID, "", "no-es-un-uuid" })
	void sessionOrganizationRejectsAnythingButACanonicalUuid(String value) {
		assertThat(fieldErrors(() -> MemberRequestParser
			.sessionOrganization(JSON.readTree("{\"organizationId\": \"%s\"}".formatted(value)))))
			.containsExactly(new FieldErrorDetail("organizationId", "Debe ser un identificador de organización válido."));
	}

	@Test
	void sessionOrganizationAcceptsACanonicalUuid() {
		assertThat(MemberRequestParser.sessionOrganization(JSON.readTree("{\"organizationId\": \"%s\"}".formatted(ID))))
			.isEqualTo(UUID.fromString(ID));
	}

	@Test
	void inviteNameRejectsControlCharacters() {
		for (String text : CONTROL_TEXTS) {
			assertThat(fieldErrors(() -> MemberRequestParser.invite(JSON
				.readTree("{\"email\": \"ana@example.com\", \"role\": \"agent\", \"name\": \"%s\"}".formatted(text)))))
				.as(text)
				.containsExactly(new FieldErrorDetail("name", CONTROLS));
		}
	}

	@Test
	void inviteEmailRejectsControlCharacters() {
		for (String text : new String[] { "ana\\u0000@example.com", "\\u0000ana@example.com", "ana@example.com\\u0000",
				"ana\\n@example.com", "ana@exam\\tple.com" }) {
			assertThat(fieldErrors(() -> MemberRequestParser
				.invite(JSON.readTree("{\"email\": \"%s\", \"role\": \"agent\"}".formatted(text)))))
				.as(text)
				.containsExactly(new FieldErrorDetail("email", CONTROLS));
		}
	}

	@Test
	void profileNameRejectsControlCharacters() {
		for (String text : CONTROL_TEXTS) {
			assertThat(fieldErrors(() -> MemberRequestParser.profileName(JSON.readTree("{\"name\": \"%s\"}".formatted(text)))))
				.as(text)
				.containsExactly(new FieldErrorDetail("name", CONTROLS));
		}
	}

	private static List<FieldErrorDetail> fieldErrors(Runnable parse) {
		try {
			parse.run();
		}
		catch (ApiValidationException exception) {
			return exception.errors();
		}
		throw new AssertionError("Debía rechazarse");
	}

}
