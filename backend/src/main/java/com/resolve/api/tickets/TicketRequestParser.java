package com.resolve.api.tickets;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.persistence.WireEnum;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Valida filtros y cuerpos acumulando todos los errores en una sola respuesta 400. */
final class TicketRequestParser {

	static final int MAX_QUERY_LENGTH = 120;

	static final int MAX_SUBJECT_LENGTH = 160;

	static final int MAX_TEXT_LENGTH = 5000;

	private static final Pattern TICKET_NUMBER = Pattern.compile("^#?(\\d{1,18})$");

	private static final Pattern STRONG_ETAG = Pattern.compile("^\"(\\d{1,18})\"$");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	static TicketFilters filters(@Nullable String view, @Nullable List<String> statuses,
			@Nullable List<String> priorities, @Nullable String assigneeId, @Nullable String q) {
		TicketRequestParser parser = new TicketRequestParser();
		TicketView parsedView = (view == null || view.isBlank()) ? TicketView.ALL
				: parser.enumValue("view", view, TicketView.class).orElse(TicketView.ALL);
		Set<TicketStatus> parsedStatuses = parser.enumSet("status", statuses, TicketStatus.class);
		Set<TicketPriority> parsedPriorities = parser.enumSet("priority", priorities, TicketPriority.class);
		TicketFilters.AssigneeFilter assignee = null;
		if (assigneeId != null && !assigneeId.isBlank()) {
			assignee = "none".equals(assigneeId) ? TicketFilters.AssigneeFilter.none()
					: parser.uuid("assigneeId", assigneeId).map(TicketFilters.AssigneeFilter::new).orElse(null);
		}
		Long number = null;
		String text = null;
		if (q != null && !q.isBlank()) {
			String trimmed = q.trim();
			if (trimmed.length() > MAX_QUERY_LENGTH) {
				parser.error("q", "La búsqueda admite como máximo " + MAX_QUERY_LENGTH + " caracteres.");
			}
			Matcher matcher = TICKET_NUMBER.matcher(trimmed);
			if (matcher.matches()) {
				number = Long.parseLong(matcher.group(1));
			}
			else {
				text = trimmed;
			}
		}
		parser.throwIfInvalid();
		return new TicketFilters(parsedView, parsedStatuses, parsedPriorities, assignee, number, text);
	}

	/** Número de ticket de la ruta: entero positivo. */
	static long ticketNumber(String value) {
		try {
			long number = Long.parseLong(value);
			if (number >= 1) {
				return number;
			}
		}
		catch (NumberFormatException exception) {
			// Se informa abajo como error de validación.
		}
		throw new ApiValidationException("number", "Debe ser un número de ticket positivo.");
	}

	/** Versión de una cabecera If-Match: un único validador fuerte {@code "<n>"}. */
	static long expectedVersion(String ifMatch) {
		Matcher matcher = STRONG_ETAG.matcher(ifMatch.trim());
		if (!matcher.matches()) {
			throw new ApiValidationException("If-Match", "Envía la versión entre comillas, como en la cabecera ETag.");
		}
		return Long.parseLong(matcher.group(1));
	}

	record NewTicket(UUID customerId, String subject, String description, TicketPriority priority,
			TicketChannel channel, @Nullable UUID assigneeId) {
	}

	static NewTicket newTicket(TicketRequests.CreateTicket request) {
		TicketRequestParser parser = new TicketRequestParser();
		UUID customerId = parser.requiredUuid("customerId", request.customerId());
		String subject = parser.requiredText("subject", request.subject(), MAX_SUBJECT_LENGTH);
		String description = parser.requiredText("description", request.description(), MAX_TEXT_LENGTH);
		TicketPriority priority = (request.priority() == null) ? TicketPriority.MEDIUM
				: parser.enumValue("priority", request.priority(), TicketPriority.class).orElse(TicketPriority.MEDIUM);
		TicketChannel channel = (request.channel() == null) ? TicketChannel.WEB
				: parser.enumValue("channel", request.channel(), TicketChannel.class).orElse(TicketChannel.WEB);
		UUID assigneeId = (request.assigneeId() == null) ? null : parser.uuid("assigneeId", request.assigneeId()).orElse(null);
		parser.throwIfInvalid();
		return new NewTicket(customerId, subject, description, priority, channel, assigneeId);
	}

	/**
	 * Cambios de un PATCH con semántica merge-patch: un campo ausente no cambia y {@code assigneeId: null} quita
	 * el responsable.
	 */
	record TicketChanges(@Nullable TicketStatus status, @Nullable TicketPriority priority, boolean assigneeChanged,
			@Nullable UUID assigneeId) {
	}

	static TicketChanges changes(@Nullable JsonNode body) {
		TicketRequestParser parser = new TicketRequestParser();
		if (body == null || !body.isObject() || body.isEmpty()) {
			throw new ApiValidationException("body", "Envía al menos uno de estos campos: status, priority, assigneeId.");
		}
		for (String field : body.propertyNames()) {
			if (!Set.of("status", "priority", "assigneeId").contains(field)) {
				parser.error(field, "Campo no permitido.");
			}
		}
		TicketStatus status = body.has("status") ? parser.enumNode("status", body.get("status"), TicketStatus.class) : null;
		TicketPriority priority = body.has("priority")
				? parser.enumNode("priority", body.get("priority"), TicketPriority.class) : null;
		boolean assigneeChanged = body.has("assigneeId");
		UUID assigneeId = null;
		if (assigneeChanged && !body.get("assigneeId").isNull()) {
			JsonNode node = body.get("assigneeId");
			assigneeId = node.isString() ? parser.uuid("assigneeId", node.asString()).orElse(null)
					: parser.invalid("assigneeId", "Debe ser un id de miembro o null.");
		}
		parser.throwIfInvalid();
		return new TicketChanges(status, priority, assigneeChanged, assigneeId);
	}

	record NewMessage(String body, MessageVisibility visibility) {
	}

	static NewMessage newMessage(TicketRequests.CreateMessage request) {
		TicketRequestParser parser = new TicketRequestParser();
		String body = parser.requiredText("body", request.body(), MAX_TEXT_LENGTH);
		MessageVisibility visibility = null;
		if (request.visibility() == null) {
			parser.error("visibility", "Indica si es una respuesta pública (public) o una nota interna (internal).");
		}
		else {
			visibility = parser.enumValue("visibility", request.visibility(), MessageVisibility.class).orElse(null);
		}
		parser.throwIfInvalid();
		return new NewMessage(body, visibility);
	}

	private <E extends Enum<E> & WireEnum> @Nullable E enumNode(String field, JsonNode node, Class<E> type) {
		if (!node.isString()) {
			return invalid(field, "Valor no válido. Usa: " + allowed(type) + ".");
		}
		return enumValue(field, node.asString(), type).orElse(null);
	}

	private <E extends Enum<E> & WireEnum> Optional<E> enumValue(String field, String value, Class<E> type) {
		Optional<E> parsed = WireEnum.fromWire(type, value);
		if (parsed.isEmpty()) {
			error(field, "Valor no válido. Usa: " + allowed(type) + ".");
		}
		return parsed;
	}

	private <E extends Enum<E> & WireEnum> Set<E> enumSet(String field, @Nullable List<String> values, Class<E> type) {
		Set<E> result = EnumSet.noneOf(type);
		if (values != null) {
			values.stream()
				.flatMap((value) -> List.of(value.split(",")).stream())
				.filter((value) -> !value.isBlank())
				.forEach((value) -> enumValue(field, value.trim(), type).ifPresent(result::add));
		}
		return result;
	}

	private UUID requiredUuid(String field, @Nullable String value) {
		if (value == null || value.isBlank()) {
			return invalid(field, "Es obligatorio.");
		}
		return uuid(field, value).orElse(null);
	}

	private Optional<UUID> uuid(String field, String value) {
		try {
			return Optional.of(UUID.fromString(value.trim()));
		}
		catch (IllegalArgumentException exception) {
			error(field, "Debe ser un identificador válido.");
			return Optional.empty();
		}
	}

	private String requiredText(String field, @Nullable String value, int maxLength) {
		String trimmed = (value != null) ? value.strip() : "";
		if (trimmed.isEmpty()) {
			return invalid(field, "Es obligatorio.");
		}
		if (trimmed.length() > maxLength) {
			return invalid(field, "Admite como máximo " + maxLength + " caracteres.");
		}
		return trimmed;
	}

	private static <E extends Enum<E> & WireEnum> String allowed(Class<E> type) {
		return String.join(", ", Arrays.stream(type.getEnumConstants()).map(WireEnum::wireValue).toList());
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
