package com.resolve.api.memberships;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Valida los cuerpos del equipo acumulando todos los errores en una sola respuesta 400. */
final class MemberRequestParser {

	static final int MAX_NAME_LENGTH = 120;

	static final int MAX_EMAIL_LENGTH = 254;

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

	private static final Set<String> INVITE_FIELDS = Set.of("email", "name", "role");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	private MemberRequestParser() {
	}

	/** Id de la ruta: un UUID. Uno mal formado es un 400; uno bien formado pero ajeno o inexistente, un 404. */
	static UUID userId(String value) {
		try {
			return UUID.fromString(value.trim());
		}
		catch (IllegalArgumentException exception) {
			throw new ApiValidationException("userId", "Debe ser un identificador de miembro válido.");
		}
	}

	record NewInvite(String email, String name, Role role) {
	}

	/** Invitación: {@code email} y {@code role} son obligatorios; {@code name} toma la parte local del correo. */
	static NewInvite invite(@Nullable JsonNode body) {
		MemberRequestParser parser = new MemberRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con email y role.");
		}
		for (String field : body.propertyNames()) {
			if (!INVITE_FIELDS.contains(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		String email = body.has("email") ? parser.email(body.get("email")) : parser.invalid("email", "Es obligatorio.");
		String name = body.has("name") ? parser.name(body.get("name")) : null;
		Role role = body.has("role") ? parser.role(body.get("role")) : parser.invalid("role", "Es obligatorio.");
		parser.throwIfInvalid();
		String localPart = email.substring(0, email.indexOf('@'));
		return new NewInvite(email, (name != null) ? name : localPart.substring(0, Math.min(MAX_NAME_LENGTH, localPart.length())),
				role);
	}

	/** Cambio de rol: un objeto con solo {@code role}. */
	static Role roleChange(@Nullable JsonNode body) {
		MemberRequestParser parser = new MemberRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con role.");
		}
		for (String field : body.propertyNames()) {
			if (!"role".equals(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		Role role = body.has("role") ? parser.role(body.get("role")) : parser.invalid("role", "Es obligatorio.");
		parser.throwIfInvalid();
		return role;
	}

	/** Perfil propio: un objeto con solo {@code name}, que es obligatorio. */
	static String profileName(@Nullable JsonNode body) {
		MemberRequestParser parser = new MemberRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con name.");
		}
		for (String field : body.propertyNames()) {
			if (!"name".equals(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		String name = body.has("name") ? parser.name(body.get("name")) : parser.invalid("name", "Es obligatorio.");
		parser.throwIfInvalid();
		return name;
	}

	/** Cambio de organización de la sesión: un objeto con solo {@code organizationId}, un UUID. */
	static UUID sessionOrganization(@Nullable JsonNode body) {
		MemberRequestParser parser = new MemberRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con organizationId.");
		}
		for (String field : body.propertyNames()) {
			if (!"organizationId".equals(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		@Nullable UUID id = null;
		if (!body.has("organizationId")) {
			parser.error("organizationId", "Es obligatorio.");
		}
		else if (!body.get("organizationId").isString()) {
			parser.error("organizationId", body.get("organizationId").isNull() ? "No admite null." : "Debe ser un texto.");
		}
		else {
			try {
				id = UUID.fromString(body.get("organizationId").asString().trim());
			}
			catch (IllegalArgumentException exception) {
				parser.error("organizationId", "Debe ser un identificador de organización válido.");
			}
		}
		parser.throwIfInvalid();
		return Objects.requireNonNull(id);
	}

	private @Nullable Role role(JsonNode node) {
		if (node.isString()) {
			String value = node.asString();
			if ("admin".equals(value)) {
				return Role.ADMIN;
			}
			if ("agent".equals(value)) {
				return Role.AGENT;
			}
		}
		return invalid("role", "Debe ser admin o agent.");
	}

	private @Nullable String email(JsonNode node) {
		if (!node.isString()) {
			return invalid("email", node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return invalid("email", "Es obligatorio.");
		}
		if (hasControlCharacters(trimmed)) {
			return invalid("email", "No admite caracteres de control.");
		}
		if (trimmed.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(trimmed).matches()) {
			return invalid("email", "Escribe un correo válido de hasta " + MAX_EMAIL_LENGTH + " caracteres.");
		}
		return trimmed;
	}

	private @Nullable String name(JsonNode node) {
		if (!node.isString()) {
			return invalid("name", node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return invalid("name", "Es obligatorio.");
		}
		if (hasControlCharacters(trimmed)) {
			return invalid("name", "No admite caracteres de control.");
		}
		if (trimmed.length() > MAX_NAME_LENGTH) {
			return invalid("name", "Admite como máximo " + MAX_NAME_LENGTH + " caracteres.");
		}
		return trimmed;
	}

	private static boolean hasControlCharacters(String text) {
		return text.chars().anyMatch(Character::isISOControl);
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
