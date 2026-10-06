package com.resolve.api.organizations;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.web.ControlCharacters;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Valida el cuerpo del PATCH de los ajustes acumulando todos los errores en una sola respuesta 400. */
final class OrganizationRequestParser {

	static final int MAX_NAME_LENGTH = 120;

	static final int MAX_EMAIL_LENGTH = 254;

	static final int MIN_TARGET_MINUTES = 1;

	static final int MAX_TARGET_MINUTES = 1440;

	private static final String CONTROL_CHARACTERS = ControlCharacters.MESSAGE;

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

	private static final Set<String> PATCHABLE = Set.of("name", "supportEmail", "timeZone",
			"firstResponseTargetMinutes");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	private OrganizationRequestParser() {
	}

	/**
	 * Cambios de un PATCH con semántica merge-patch: un campo ausente no cambia y {@code supportEmail} nulo o vacío lo
	 * borra. Los demás campos no admiten {@code null}.
	 */
	record OrganizationChanges(@Nullable String name, boolean supportEmailChanged, @Nullable String supportEmail,
			@Nullable String timeZone, @Nullable Integer firstResponseTargetMinutes) {
	}

	/**
	 * @param databaseKnowsZone si la base de datos reconoce el nombre de zona: Java acepta alias y desplazamientos
	 * ({@code UTC+5}) que PostgreSQL interpreta con otro signo, y las consultas de métricas e informes agrupan por día
	 * en la base
	 */
	static OrganizationChanges changes(@Nullable JsonNode body, Predicate<String> databaseKnowsZone) {
		OrganizationRequestParser parser = new OrganizationRequestParser();
		if (body == null || !body.isObject() || body.isEmpty()) {
			throw new ApiValidationException("body",
					"Envía al menos uno de estos campos: name, supportEmail, timeZone, firstResponseTargetMinutes.");
		}
		for (String field : body.propertyNames()) {
			if (!PATCHABLE.contains(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		String name = body.has("name") ? parser.name(body.get("name")) : null;
		boolean supportEmailChanged = body.has("supportEmail");
		String supportEmail = supportEmailChanged ? parser.supportEmail(body.get("supportEmail")) : null;
		String timeZone = body.has("timeZone") ? parser.timeZone(body.get("timeZone"), databaseKnowsZone) : null;
		Integer target = body.has("firstResponseTargetMinutes") ? parser.target(body.get("firstResponseTargetMinutes"))
				: null;
		parser.throwIfInvalid();
		return new OrganizationChanges(name, supportEmailChanged, supportEmail, timeZone, target);
	}

	private @Nullable String name(JsonNode node) {
		if (!node.isString()) {
			return invalid("name", node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return invalid("name", "Es obligatorio.");
		}
		if (ControlCharacters.in(trimmed, false)) {
			return invalid("name", CONTROL_CHARACTERS);
		}
		if (trimmed.length() > MAX_NAME_LENGTH) {
			return invalid("name", "Admite como máximo " + MAX_NAME_LENGTH + " caracteres.");
		}
		return trimmed;
	}

	/** Un correo en blanco o {@code null} borra el correo de soporte. */
	private @Nullable String supportEmail(JsonNode node) {
		if (node.isNull()) {
			return null;
		}
		if (!node.isString()) {
			return invalid("supportEmail", "Debe ser un texto o null.");
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return null;
		}
		if (ControlCharacters.in(trimmed, false)) {
			return invalid("supportEmail", CONTROL_CHARACTERS);
		}
		if (trimmed.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(trimmed).matches()) {
			return invalid("supportEmail", "Escribe un correo válido de hasta " + MAX_EMAIL_LENGTH + " caracteres.");
		}
		return trimmed;
	}

	/** Región IANA escrita exactamente como la conocen Java y la base de datos; ni desplazamientos ni alias. */
	private @Nullable String timeZone(JsonNode node, Predicate<String> databaseKnowsZone) {
		String message = "Elige una zona horaria válida, por ejemplo America/Bogota.";
		if (!node.isString()) {
			return invalid("timeZone", node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		String value = node.asString();
		if (value.isEmpty() || ControlCharacters.in(value, false) || !isRegion(value) || !databaseKnowsZone.test(value)) {
			return invalid("timeZone", message);
		}
		return value;
	}

	private static boolean isRegion(String value) {
		try {
			ZoneId zone = ZoneId.of(value);
			return !(zone instanceof ZoneOffset) && zone.getId().equals(value);
		}
		catch (DateTimeException exception) {
			return false;
		}
	}

	private @Nullable Integer target(JsonNode node) {
		String message = "Debe ser un número entero de minutos entre " + MIN_TARGET_MINUTES + " y "
				+ MAX_TARGET_MINUTES + ".";
		if (!node.isIntegralNumber() || !node.canConvertToInt()) {
			return invalid("firstResponseTargetMinutes", node.isNull() ? "No admite null." : message);
		}
		int minutes = node.asInt();
		if (minutes < MIN_TARGET_MINUTES || minutes > MAX_TARGET_MINUTES) {
			return invalid("firstResponseTargetMinutes", message);
		}
		return minutes;
	}

	private <T> @Nullable T invalid(String field, String message) {
		error(field, message);
		return null;
	}

	private void error(String field, String message) {
		this.errors.add(new FieldErrorDetail(field, message));
	}

	private void throwIfInvalid() {
		if (!this.errors.isEmpty()) {
			throw new ApiValidationException(this.errors);
		}
	}

}
