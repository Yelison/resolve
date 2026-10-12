package com.resolve.api.organizations;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Las dos capas de validación de la zona horaria por separado: la que hace Java (región exacta, ni desplazamientos ni
 * alias que se normalizan) y la que delega en la base de datos (el predicado). Con la base aceptándolo todo, solo
 * queda la primera; con la base rechazándolo todo, comprueba que se usa la segunda.
 */
class OrganizationRequestParserTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@ParameterizedTest
	@ValueSource(strings = { "+05:00", "Z", "UTC+5", "GMT+5", "GMT+0", "america/bogota", "Mars/Olympus", "" })
	void javaRejectsOffsetsNormalizedAliasesAndOtherSpellingsEvenIfTheDatabaseAcceptsThem(String zone) {
		assertThatThrownBy(() -> OrganizationRequestParser.changes(JSON.readTree("{\"timeZone\": \"%s\"}".formatted(zone)),
				(candidate) -> true))
			.isInstanceOfSatisfying(ApiValidationException.class,
					(exception) -> assertThat(exception.errors()).singleElement()
						.satisfies((error) -> assertThat(error.field()).isEqualTo("timeZone")));
	}

	@Test
	void aRegionJavaKnowsIsRejectedWhenTheDatabaseDoesNotKnowIt() {
		assertThatThrownBy(() -> OrganizationRequestParser.changes(JSON.readTree("{\"timeZone\": \"America/Bogota\"}"),
				(candidate) -> false))
			.isInstanceOfSatisfying(ApiValidationException.class,
					(exception) -> assertThat(exception.errors()).singleElement()
						.satisfies((error) -> assertThat(error.field()).isEqualTo("timeZone")));
	}

	@Test
	void anExactRegionBothSidesKnowIsAccepted() {
		assertThat(OrganizationRequestParser.changes(JSON.readTree("{\"timeZone\": \"America/Bogota\"}"),
				(candidate) -> true)
			.timeZone()).isEqualTo("America/Bogota");
	}

	@ParameterizedTest
	@ValueSource(strings = { "Acme\\u0000Corp", "\\u0000Acme", "Acme\\u0000", "Acme\\u001bCorp", "Acme\\nCorp", "Acme\\tCorp",
			"Acme\\u007fCorp" })
	void nameRejectsControlCharacters(String text) {
		assertOnlyError("name", "{\"name\": \"%s\"}".formatted(text), "No admite caracteres de control.");
	}

	@ParameterizedTest
	@ValueSource(strings = { "ayuda\\u0000@acme.example", "\\u0000ayuda@acme.example", "ayuda@acme.example\\u0000",
			"ayuda\\n@acme.example", "ayuda@acme.\\texample" })
	void supportEmailRejectsControlCharacters(String text) {
		assertOnlyError("supportEmail", "{\"supportEmail\": \"%s\"}".formatted(text),
				"No admite caracteres de control.");
	}

	@ParameterizedTest
	@ValueSource(strings = { "America/Bogota\\u0000", "\\u0000America/Bogota", "America/\\nBogota" })
	void timeZoneRejectsControlCharactersEvenIfTheDatabaseAcceptsThem(String text) {
		assertOnlyError("timeZone", "{\"timeZone\": \"%s\"}".formatted(text),
				"Elige una zona horaria válida, por ejemplo America/Bogota.");
	}

	@ParameterizedTest
	@ValueSource(strings = { "blue", "green", "magenta", "orange", "violet", "teal", "brick", "slate" })
	void colorAcceptsEachOfTheEightKeys(String key) {
		assertThat(OrganizationRequestParser.changes(JSON.readTree("{\"color\": \"%s\"}".formatted(key)), (candidate) -> true)
			.color()).isEqualTo(key);
	}

	@ParameterizedTest
	@ValueSource(strings = { "\"pink\"", "\"BLUE\"", "\" blue\"", "\"\"", "7", "true", "[\"blue\"]" })
	void colorRejectsAnythingElseOnItsOwnField(String json) {
		assertThatThrownBy(() -> OrganizationRequestParser.changes(JSON.readTree("{\"color\": " + json + "}"), (candidate) -> true))
			.isInstanceOfSatisfying(ApiValidationException.class,
					(exception) -> assertThat(exception.errors()).singleElement()
						.satisfies((error) -> assertThat(error.field()).isEqualTo("color")));
	}

	@Test
	void colorDoesNotAcceptNull() {
		assertOnlyError("color", "{\"color\": null}", "No admite null.");
	}

	@Test
	void creationTakesTheNameTrimmedAndTheZoneAndNothingElse() {
		OrganizationRequestParser.NewOrganization created = OrganizationRequestParser.creation(
				JSON.readTree("{\"name\": \"  Mi espacio \", \"timeZone\": \"America/Bogota\"}"), (candidate) -> true);
		assertThat(created).isEqualTo(new OrganizationRequestParser.NewOrganization("Mi espacio", "America/Bogota"));
	}

	@Test
	void creationReportsEveryFieldAtOnceAndUsesTheDatabaseForTheZone() {
		assertThatThrownBy(() -> OrganizationRequestParser.creation(JSON.readTree("{\"name\": \" \", \"color\": \"blue\"}"),
				(candidate) -> true))
			.isInstanceOfSatisfying(ApiValidationException.class, (exception) -> assertThat(exception.errors())
				.extracting(FieldErrorDetail::field)
				.containsExactlyInAnyOrder("color", "name", "timeZone"));
		assertThatThrownBy(() -> OrganizationRequestParser.creation(
				JSON.readTree("{\"name\": \"Ok\", \"timeZone\": \"America/Bogota\"}"), (candidate) -> false))
			.isInstanceOfSatisfying(ApiValidationException.class,
					(exception) -> assertThat(exception.errors()).singleElement()
						.satisfies((error) -> assertThat(error.field()).isEqualTo("timeZone")));
	}

	private static void assertOnlyError(String field, String body, String message) {
		assertThatThrownBy(() -> OrganizationRequestParser.changes(JSON.readTree(body), (candidate) -> true))
			.isInstanceOfSatisfying(ApiValidationException.class,
					(exception) -> assertThat(exception.errors()).containsExactly(new FieldErrorDetail(field, message)));
	}

}
