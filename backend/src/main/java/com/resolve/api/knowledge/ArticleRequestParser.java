package com.resolve.api.knowledge;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.persistence.WireEnum;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * Valida filtros y cuerpos de artículos y categorías acumulando todos los errores en una sola respuesta 400. Los
 * tipos se comprueban sobre el {@link JsonNode}: un {@code title} numérico es un error del campo, no un fallo de
 * deserialización.
 */
final class ArticleRequestParser {

	static final int MAX_QUERY_LENGTH = 120;

	static final int MAX_CATEGORY_FILTER_LENGTH = 120;

	static final int MAX_TITLE_LENGTH = 160;

	/** Límite del cuerpo en caracteres (D-14); el mensaje lo escribe con el espacio de millares del español. */
	static final int MAX_BODY_LENGTH = 20_000;

	static final int MAX_CATEGORY_NAME_LENGTH = 80;

	static final int MAX_CATEGORY_DESCRIPTION_LENGTH = 160;

	private static final String CONTROL_CHARACTERS = "No admite caracteres de control.";

	private static final String TEXT_EXPECTED = "Debe ser un texto.";

	private static final String NULL_NOT_ALLOWED = "No admite null.";

	private static final String REQUIRED = "Es obligatorio.";

	private static final Set<String> ARTICLE_FIELDS = Set.of("title", "body", "categoryId", "visibility",
			"allowFeedback");

	private static final Set<String> CATEGORY_FIELDS = Set.of("name", "description");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	private ArticleRequestParser() {
	}

	static ArticleFilters filters(@Nullable String q, @Nullable String category, @Nullable String status) {
		ArticleRequestParser parser = new ArticleRequestParser();
		String text = null;
		if (q != null && !q.isBlank()) {
			text = q.trim();
			if (text.codePointCount(0, text.length()) > MAX_QUERY_LENGTH) {
				parser.error("q", "La búsqueda admite como máximo " + MAX_QUERY_LENGTH + " caracteres.");
			}
		}
		String categorySlug = (category == null || category.isBlank()) ? null : category.trim();
		if (categorySlug != null
				&& categorySlug.codePointCount(0, categorySlug.length()) > MAX_CATEGORY_FILTER_LENGTH) {
			parser.error("category", "La categoría admite como máximo " + MAX_CATEGORY_FILTER_LENGTH + " caracteres.");
		}
		ArticleStatus statusFilter = null;
		if (status != null && !status.isBlank()) {
			statusFilter = WireEnum.fromWire(ArticleStatus.class, status.trim()).orElse(null);
			if (statusFilter == null) {
				parser.error("status", "Debe ser draft o published.");
			}
		}
		parser.throwIfInvalid();
		return new ArticleFilters(text, categorySlug, statusFilter);
	}

	record NewArticle(String title, String body, UUID categoryId, ArticleVisibility visibility,
			boolean allowFeedback) {
	}

	/** Alta: los mismos tipos y reglas que el PATCH; todo salvo {@code allowFeedback} (por defecto {@code true}) es obligatorio. */
	static NewArticle newArticle(@Nullable JsonNode body) {
		ArticleRequestParser parser = new ArticleRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con title, body, categoryId y visibility.");
		}
		parser.rejectUnknownFields(body, ARTICLE_FIELDS);
		String title = body.has("title") ? parser.title(body.get("title")) : parser.invalid("title", REQUIRED);
		String text = body.has("body") ? parser.body(body.get("body")) : parser.invalid("body", REQUIRED);
		UUID categoryId = body.has("categoryId") ? parser.categoryId(body.get("categoryId"))
				: parser.invalid("categoryId", REQUIRED);
		ArticleVisibility visibility = body.has("visibility") ? parser.visibility(body.get("visibility"))
				: parser.invalid("visibility", REQUIRED);
		Boolean allowFeedback = body.has("allowFeedback") ? parser.allowFeedback(body.get("allowFeedback")) : Boolean.TRUE;
		parser.throwIfInvalid();
		return new NewArticle(title, text, categoryId, visibility, allowFeedback);
	}

	/** Cambios de un PATCH con semántica merge-patch: un campo ausente no cambia y ninguno admite {@code null}. */
	record ArticleChanges(@Nullable String title, @Nullable String body, @Nullable UUID categoryId,
			@Nullable ArticleVisibility visibility, @Nullable Boolean allowFeedback) {
	}

	static ArticleChanges changes(@Nullable JsonNode body) {
		ArticleRequestParser parser = new ArticleRequestParser();
		if (body == null || !body.isObject() || body.isEmpty()) {
			throw new ApiValidationException("body",
					"Envía al menos uno de estos campos: title, body, categoryId, visibility, allowFeedback.");
		}
		parser.rejectUnknownFields(body, ARTICLE_FIELDS);
		String title = body.has("title") ? parser.title(body.get("title")) : null;
		String text = body.has("body") ? parser.body(body.get("body")) : null;
		UUID categoryId = body.has("categoryId") ? parser.categoryId(body.get("categoryId")) : null;
		ArticleVisibility visibility = body.has("visibility") ? parser.visibility(body.get("visibility")) : null;
		Boolean allowFeedback = body.has("allowFeedback") ? parser.allowFeedback(body.get("allowFeedback")) : null;
		parser.throwIfInvalid();
		return new ArticleChanges(title, text, categoryId, visibility, allowFeedback);
	}

	record NewCategory(String name, @Nullable String description) {
	}

	static NewCategory newCategory(@Nullable JsonNode body) {
		ArticleRequestParser parser = new ArticleRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con name.");
		}
		parser.rejectUnknownFields(body, CATEGORY_FIELDS);
		String name = body.has("name") ? parser.requiredLine("name", body.get("name"), MAX_CATEGORY_NAME_LENGTH)
				: parser.invalid("name", REQUIRED);
		String description = body.has("description") ? parser.optionalLine("description", body.get("description"),
				MAX_CATEGORY_DESCRIPTION_LENGTH) : null;
		parser.throwIfInvalid();
		return new NewCategory(name, description);
	}

	private void rejectUnknownFields(JsonNode body, Set<String> allowed) {
		for (String field : body.propertyNames()) {
			if (!allowed.contains(field)) {
				error(field, "Campo no permitido.");
			}
		}
	}

	private @Nullable String title(JsonNode node) {
		return requiredLine("title", node, MAX_TITLE_LENGTH);
	}

	/**
	 * El cuerpo es Markdown: se guarda tal cual, sin recortar espacios, y admite saltos de línea y tabuladores. Solo
	 * se rechazan los demás caracteres de control, entre ellos el byte 0 que PostgreSQL no puede guardar.
	 */
	private @Nullable String body(JsonNode node) {
		if (!node.isString()) {
			return invalid("body", node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		String value = node.asString();
		if (value.isBlank()) {
			return invalid("body", REQUIRED);
		}
		if (hasControlCharacters(value, true)) {
			return invalid("body", CONTROL_CHARACTERS);
		}
		if (value.codePointCount(0, value.length()) > MAX_BODY_LENGTH) {
			return invalid("body", "Admite como máximo 20 000 caracteres.");
		}
		return value;
	}

	private @Nullable UUID categoryId(JsonNode node) {
		if (!node.isString()) {
			return invalid("categoryId", node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		try {
			return UUID.fromString(node.asString().trim());
		}
		catch (IllegalArgumentException exception) {
			return invalid("categoryId", "Debe ser un identificador de categoría válido.");
		}
	}

	private @Nullable ArticleVisibility visibility(JsonNode node) {
		if (!node.isString()) {
			return invalid("visibility", node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		ArticleVisibility visibility = WireEnum.fromWire(ArticleVisibility.class, node.asString()).orElse(null);
		return (visibility != null) ? visibility : invalid("visibility", "Debe ser internal o public.");
	}

	private @Nullable Boolean allowFeedback(JsonNode node) {
		if (!node.isBoolean()) {
			return invalid("allowFeedback", node.isNull() ? NULL_NOT_ALLOWED : "Debe ser verdadero o falso.");
		}
		return node.asBoolean();
	}

	/** Texto de una línea obligatorio: recortado, sin caracteres de control y con un máximo. */
	private @Nullable String requiredLine(String field, JsonNode node, int maxLength) {
		if (!node.isString()) {
			return invalid(field, node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return invalid(field, REQUIRED);
		}
		return checkedLine(field, trimmed, maxLength);
	}

	/** Texto de una línea opcional: en blanco o {@code null} equivale a no tenerlo. */
	private @Nullable String optionalLine(String field, JsonNode node, int maxLength) {
		if (node.isNull()) {
			return null;
		}
		if (!node.isString()) {
			return invalid(field, "Debe ser un texto o null.");
		}
		String trimmed = node.asString().strip();
		return trimmed.isEmpty() ? null : checkedLine(field, trimmed, maxLength);
	}

	private @Nullable String checkedLine(String field, String trimmed, int maxLength) {
		if (hasControlCharacters(trimmed, false)) {
			return invalid(field, CONTROL_CHARACTERS);
		}
		if (trimmed.codePointCount(0, trimmed.length()) > maxLength) {
			return invalid(field, "Admite como máximo " + maxLength + " caracteres.");
		}
		return trimmed;
	}

	private static boolean hasControlCharacters(String text, boolean allowLayout) {
		return text.chars()
			.anyMatch((character) -> Character.isISOControl(character)
					&& !(allowLayout && (character == '\n' || character == '\r' || character == '\t')));
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
