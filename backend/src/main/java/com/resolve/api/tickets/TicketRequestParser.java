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
import com.resolve.api.common.web.ControlCharacters;
import com.resolve.api.common.web.Uuids;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Valida filtros y cuerpos acumulando todos los errores en una sola respuesta 400. */
final class TicketRequestParser {

	static final int MAX_QUERY_LENGTH = 120;

	static final int MAX_SUBJECT_LENGTH = 160;

	static final int MAX_TEXT_LENGTH = 5000;

	private static final String CONTROL_CHARACTERS = ControlCharacters.MESSAGE;

	private static final String TEXT_EXPECTED = "Debe ser un texto.";

	private static final String NULL_NOT_ALLOWED = "No admite null.";

	private static final String REQUIRED = "Es obligatorio.";

	private static final Set<String> NEW_TICKET_FIELDS = Set.of("customerId", "subject", "description", "priority",
			"channel", "assigneeId");

	private static final Set<String> NEW_MESSAGE_FIELDS = Set.of("body", "visibility");

	private static final Pattern TICKET_NUMBER = Pattern.compile("^#?(\\d{1,18})$");

	private final List<FieldErrorDetail> errors = new ArrayList<>();

	static TicketFilters filters(@Nullable String view, @Nullable List<String> statuses,
			@Nullable List<String> priorities, @Nullable String assigneeId, @Nullable String customerId,
			@Nullable String q) {
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
		UUID customer = (customerId == null || customerId.isBlank()) ? null
				: parser.uuid("customerId", customerId).orElse(null);
		Long number = null;
		String text = null;
		if (q != null && ControlCharacters.in(q, false)) {
			parser.error("q", CONTROL_CHARACTERS);
		}
		else if (q != null && !q.isBlank()) {
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
		return new TicketFilters(parsedView, parsedStatuses, parsedPriorities, assignee, customer, number, text);
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

	record NewTicket(UUID customerId, String subject, String description, TicketPriority priority,
			TicketChannel channel, @Nullable UUID assigneeId) {
	}

	/**
	 * Alta: los tipos se comprueban sobre el {@link JsonNode}, como en clientes y artículos, para que un escalar no
	 * textual en un campo de texto sea un error del campo y no se convierta a texto. Solo {@code assigneeId}
	 * admite {@code null}, igual que el contrato.
	 */
	static NewTicket newTicket(@Nullable JsonNode body) {
		TicketRequestParser parser = new TicketRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con customerId, subject y description.");
		}
		parser.rejectUnknownFields(body, NEW_TICKET_FIELDS);
		UUID customerId = body.has("customerId") ? parser.uuidNode("customerId", body.get("customerId"))
				: parser.invalid("customerId", REQUIRED);
		String subject = body.has("subject")
				? parser.requiredTextNode("subject", body.get("subject"), MAX_SUBJECT_LENGTH, false)
				: parser.invalid("subject", REQUIRED);
		String description = body.has("description")
				? parser.requiredTextNode("description", body.get("description"), MAX_TEXT_LENGTH, true)
				: parser.invalid("description", REQUIRED);
		TicketPriority priority = body.has("priority")
				? parser.enumNode("priority", body.get("priority"), TicketPriority.class) : TicketPriority.MEDIUM;
		TicketChannel channel = body.has("channel")
				? parser.enumNode("channel", body.get("channel"), TicketChannel.class) : TicketChannel.WEB;
		UUID assigneeId = (body.has("assigneeId") && !body.get("assigneeId").isNull())
				? parser.uuidNode("assigneeId", body.get("assigneeId")) : null;
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

	static NewMessage newMessage(@Nullable JsonNode body) {
		TicketRequestParser parser = new TicketRequestParser();
		if (body == null || !body.isObject()) {
			throw new ApiValidationException("body", "Envía un objeto con body y visibility.");
		}
		parser.rejectUnknownFields(body, NEW_MESSAGE_FIELDS);
		String text = body.has("body") ? parser.requiredTextNode("body", body.get("body"), MAX_TEXT_LENGTH, true)
				: parser.invalid("body", REQUIRED);
		MessageVisibility visibility = body.has("visibility")
				? parser.enumNode("visibility", body.get("visibility"), MessageVisibility.class) : null;
		if (!body.has("visibility")) {
			parser.error("visibility", "Indica si es una respuesta pública (public) o una nota interna (internal).");
		}
		parser.throwIfInvalid();
		return new NewMessage(text, visibility);
	}

	private void rejectUnknownFields(JsonNode body, Set<String> allowed) {
		for (String field : body.propertyNames()) {
			if (!allowed.contains(field)) {
				error(field, "Campo no permitido.");
			}
		}
	}

	private <E extends Enum<E> & WireEnum> @Nullable E enumNode(String field, JsonNode node, Class<E> type) {
		if (!node.isString()) {
			return invalid(field, node.isNull() ? NULL_NOT_ALLOWED : "Valor no válido. Usa: " + allowed(type) + ".");
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

	private @Nullable UUID uuidNode(String field, JsonNode node) {
		if (!node.isString()) {
			return invalid(field, node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		return uuid(field, node.asString()).orElse(null);
	}

	private Optional<UUID> uuid(String field, String value) {
		Optional<UUID> parsed = Uuids.parse(value);
		if (parsed.isEmpty()) {
			error(field, "Debe ser un identificador válido.");
		}
		return parsed;
	}

	private @Nullable String requiredTextNode(String field, JsonNode node, int maxLength, boolean allowLayout) {
		if (!node.isString()) {
			return invalid(field, node.isNull() ? NULL_NOT_ALLOWED : TEXT_EXPECTED);
		}
		String trimmed = node.asString().strip();
		if (trimmed.isEmpty()) {
			return invalid(field, REQUIRED);
		}
		if (ControlCharacters.in(trimmed, allowLayout)) {
			return invalid(field, CONTROL_CHARACTERS);
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
