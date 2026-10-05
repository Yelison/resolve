package com.resolve.api.customers;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Valida filtros y cuerpos acumulando todos los errores en una sola respuesta 400. */
final class CustomerRequestParser {

	static final int MAX_QUERY_LENGTH = 120;

	static final int MAX_NAME_LENGTH = 120;

	static final int MAX_COMPANY_LENGTH = 120;

	static final int MAX_EMAIL_LENGTH = 254;

	static final int MAX_NOTES_LENGTH = 2000;

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

	private static final Set<String> PATCHABLE = Set.of("name", "email", "company", "notes");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	private CustomerRequestParser() {
	}

	static CustomerFilters filters(@Nullable String q, @Nullable String company, @Nullable String archived) {
		CustomerRequestParser parser = new CustomerRequestParser();
		String text = null;
		if (q != null && !q.isBlank()) {
			text = q.trim();
			if (text.length() > MAX_QUERY_LENGTH) {
				parser.error("q", "La búsqueda admite como máximo " + MAX_QUERY_LENGTH + " caracteres.");
			}
		}
		String companyFilter = (company == null || company.isBlank()) ? null : company.trim();
		if (companyFilter != null && companyFilter.length() > MAX_COMPANY_LENGTH) {
			parser.error("company", "La empresa admite como máximo " + MAX_COMPANY_LENGTH + " caracteres.");
		}
		boolean archivedOnly = false;
		if (archived != null && !archived.isBlank()) {
			switch (archived.trim()) {
				case "true" -> archivedOnly = true;
				case "false" -> archivedOnly = false;
				default -> parser.error("archived", "Debe ser true o false.");
			}
		}
		parser.throwIfInvalid();
		return new CustomerFilters(text, companyFilter, archivedOnly);
	}

	/** Id de la ruta: un UUID. Uno mal formado es un 400; uno bien formado pero ajeno o inexistente, un 404. */
	static UUID customerId(String value) {
		try {
			return UUID.fromString(value.trim());
		}
		catch (IllegalArgumentException exception) {
			throw new ApiValidationException("id", "Debe ser un identificador de cliente válido.");
		}
	}

	record NewCustomer(String name, String email, @Nullable String company, @Nullable String notes) {
	}

	static NewCustomer newCustomer(CustomerRequests.CreateCustomer request) {
		CustomerRequestParser parser = new CustomerRequestParser();
		String name = parser.requiredText("name", request.name(), MAX_NAME_LENGTH);
		String email = parser.email(request.email());
		String company = parser.optionalText("company", request.company(), MAX_COMPANY_LENGTH);
		String notes = parser.optionalText("notes", request.notes(), MAX_NOTES_LENGTH);
		parser.throwIfInvalid();
		return new NewCustomer(name, email, company, notes);
	}

	/**
	 * Cambios de un PATCH con semántica merge-patch: un campo ausente no cambia y {@code null} vacía {@code company}
	 * y {@code notes}. {@code name} y {@code email} no admiten {@code null}.
	 */
	record CustomerChanges(@Nullable String name, @Nullable String email, boolean companyChanged,
			@Nullable String company, boolean notesChanged, @Nullable String notes) {
	}

	static CustomerChanges changes(@Nullable JsonNode body) {
		CustomerRequestParser parser = new CustomerRequestParser();
		if (body == null || !body.isObject() || body.isEmpty()) {
			throw new ApiValidationException("body", "Envía al menos uno de estos campos: name, email, company, notes.");
		}
		for (String field : body.propertyNames()) {
			if (!PATCHABLE.contains(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		String name = body.has("name") ? parser.requiredNode("name", body.get("name"), MAX_NAME_LENGTH) : null;
		String email = body.has("email") ? parser.emailNode(body.get("email")) : null;
		boolean companyChanged = body.has("company");
		String company = companyChanged ? parser.optionalNode("company", body.get("company"), MAX_COMPANY_LENGTH)
				: null;
		boolean notesChanged = body.has("notes");
		String notes = notesChanged ? parser.optionalNode("notes", body.get("notes"), MAX_NOTES_LENGTH) : null;
		parser.throwIfInvalid();
		return new CustomerChanges(name, email, companyChanged, company, notesChanged, notes);
	}

	private @Nullable String requiredNode(String field, JsonNode node, int maxLength) {
		if (!node.isString()) {
			return invalid(field, node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		return requiredText(field, node.asString(), maxLength);
	}

	private @Nullable String emailNode(JsonNode node) {
		if (!node.isString()) {
			return invalid("email", node.isNull() ? "No admite null." : "Debe ser un texto.");
		}
		return email(node.asString());
	}

	private @Nullable String optionalNode(String field, JsonNode node, int maxLength) {
		if (node.isNull()) {
			return null;
		}
		if (!node.isString()) {
			return invalid(field, "Debe ser un texto o null.");
		}
		return optionalText(field, node.asString(), maxLength);
	}

	private @Nullable String requiredText(String field, @Nullable String value, int maxLength) {
		String trimmed = (value != null) ? value.strip() : "";
		if (trimmed.isEmpty()) {
			return invalid(field, "Es obligatorio.");
		}
		if (trimmed.length() > maxLength) {
			return invalid(field, "Admite como máximo " + maxLength + " caracteres.");
		}
		return trimmed;
	}

	/** Texto opcional: en blanco equivale a no tenerlo. */
	private @Nullable String optionalText(String field, @Nullable String value, int maxLength) {
		String trimmed = (value != null) ? value.strip() : "";
		if (trimmed.isEmpty()) {
			return null;
		}
		if (trimmed.length() > maxLength) {
			return invalid(field, "Admite como máximo " + maxLength + " caracteres.");
		}
		return trimmed;
	}

	private @Nullable String email(@Nullable String value) {
		String trimmed = (value != null) ? value.strip() : "";
		if (trimmed.isEmpty()) {
			return invalid("email", "Es obligatorio.");
		}
		if (trimmed.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(trimmed).matches()) {
			return invalid("email", "Escribe un correo válido de hasta " + MAX_EMAIL_LENGTH + " caracteres.");
		}
		return trimmed;
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
