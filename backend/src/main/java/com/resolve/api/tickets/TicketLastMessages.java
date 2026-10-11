package com.resolve.api.tickets;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.resolve.api.tickets.TicketDtos.LastMessageDto;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Último mensaje de cada ticket de una página de la bandeja, en una sola consulta: un {@code LATERAL} por ticket que
 * recorre {@code ticket_messages_ticket_idx} hacia atrás y se detiene en la primera fila que cumple. La visibilidad
 * se decide en el SQL, no después de leer: un cliente nunca recibe una nota interna, ni siquiera para descartarla.
 */
@Component
class TicketLastMessages {

	private static final String PUBLIC_ONLY = "m.visibility = 'public'";

	private static final String ANY_VISIBILITY = "true";

	private static final String QUERY = """
			SELECT ids.ticket_id, last.visibility, last.created_at, last.body, last.author_name
			FROM unnest(CAST(:ticketIds AS uuid[])) AS ids(ticket_id)
			CROSS JOIN LATERAL (
			    SELECT m.visibility, m.created_at, left(m.body, %d) AS body,
			           coalesce(u.name, c.name) AS author_name
			    FROM ticket_messages m
			    LEFT JOIN users u ON u.id = m.author_user_id
			    LEFT JOIN customers c ON c.organization_id = m.organization_id AND c.id = m.author_customer_id
			    WHERE m.organization_id = :organizationId AND m.ticket_id = ids.ticket_id AND %s
			    ORDER BY m.created_at DESC, m.id DESC
			    LIMIT 1
			) AS last
			""";

	private final JdbcClient jdbc;

	TicketLastMessages(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Último mensaje visible de cada ticket de {@code ticketIds} dentro de la organización; los tickets sin mensajes
	 * visibles no aparecen en el resultado.
	 * @param includeInternal si el lector es personal: las notas internas cuentan como mensajes
	 */
	@Transactional(readOnly = true)
	Map<UUID, LastMessageDto> latest(UUID organizationId, Collection<UUID> ticketIds, boolean includeInternal) {
		if (ticketIds.isEmpty()) {
			return Map.of();
		}
		String sql = QUERY.formatted(MessageExcerpt.SOURCE_LENGTH, includeInternal ? ANY_VISIBILITY : PUBLIC_ONLY);
		return this.jdbc.sql(sql)
			.param("ticketIds", ticketIds.toArray(UUID[]::new))
			.param("organizationId", organizationId)
			.query((row, index) -> Map.entry(row.getObject("ticket_id", UUID.class),
					new LastMessageDto(MessageExcerpt.of(row.getString("body")), row.getString("author_name"),
							MessageVisibility.INTERNAL.wireValue().equals(row.getString("visibility")),
							row.getTimestamp("created_at").toInstant())))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

}
