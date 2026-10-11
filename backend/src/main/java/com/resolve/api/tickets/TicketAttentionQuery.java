package com.resolve.api.tickets;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import com.resolve.api.common.persistence.WireEnum;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Qué tickets sin resolver necesitan atención y por qué, calculado en una sola consulta sobre todo el alcance: no hay un
 * tope de candidatos, así que un ticket sin respuesta de prioridad baja no se escapa porque haya cientos más urgentes.
 *
 * <p>
 * Un ticket tiene a lo sumo un motivo, el primero que cumple (el orden de {@link AttentionReason}):
 * <ol>
 * <li>urgente: la prioridad es {@code urgent};</li>
 * <li>sin respuesta: está {@code open} y su último mensaje <em>público</em> es del cliente, o no tiene ninguno, desde
 * hace al menos {@link #UNANSWERED_AFTER}; sin mensajes públicos cuenta desde que se creó;</li>
 * <li>sin asignar: no tiene responsable;</li>
 * <li>el cliente respondió: su último mensaje público es del cliente;</li>
 * <li>alta: la prioridad es {@code high};</li>
 * <li>esperando: está {@code waiting} y su última actividad tiene al menos {@link #WAITING_AFTER}.</li>
 * </ol>
 * Los mensajes se juzgan por su visibilidad y por el tipo de su autor ({@code author_kind}), nunca por el nombre: una
 * nota interna no cuenta como respuesta al cliente ni tapa que el cliente escribió el último mensaje público.
 *
 * <p>
 * Dentro de un motivo el que lleva más tiempo así va primero ({@code since}) y, a igualdad, el de número mayor. Los
 * umbrales se calculan con el reloj inyectado y no con {@code now()} de la base, para que los tests puedan moverlo.
 */
@Component
class TicketAttentionQuery {

	/** Un ticket nuevo cuenta como «sin respuesta» a partir de 1 h; antes es lo normal. */
	static final Duration UNANSWERED_AFTER = Duration.ofHours(1);

	/** Esperar al cliente solo es motivo cuando lleva al menos un día. */
	static final Duration WAITING_AFTER = Duration.ofDays(1);

	/**
	 * {@code last_public} limita a los sin resolver del alcance (con los estados en lista, para usar
	 * {@code tickets_status_idx}) y añade el último mensaje público de cada uno con un
	 * {@code LATERAL} que recorre {@code ticket_messages_ticket_idx} hacia atrás y se detiene en el primero (los
	 * urgentes no lo necesitan y no lo consultan); {@code reasoned} aplica las reglas por orden; {@code classified}
	 * calcula desde cuándo. La CTE {@code classified} se usa dos veces (la página y los recuentos), así que PostgreSQL
	 * la materializa una sola vez. El {@code LEFT JOIN ... ON true} devuelve los recuentos también sin ninguna fila
	 * con motivo.
	 */
	private static final String QUERY = """
			WITH last_public AS (
			    SELECT t.id, t.number, t.priority, t.status, t.assignee_id, t.created_at, t.updated_at,
			           m.id AS message_id, m.author_kind, m.created_at AS message_at
			    FROM tickets t
			    LEFT JOIN LATERAL (
			        SELECT pm.id, pm.author_kind, pm.created_at
			        FROM ticket_messages pm
			        WHERE t.priority <> 'urgent' AND pm.organization_id = t.organization_id
			          AND pm.ticket_id = t.id AND pm.visibility = 'public'
			        ORDER BY pm.created_at DESC, pm.id DESC
			        LIMIT 1
			    ) m ON true
			    WHERE t.organization_id = :organizationId
			      AND t.status IN ('open', 'in_progress', 'waiting')%s
			), reasoned AS (
			    SELECT l.*,
			           CASE
			               WHEN l.priority = 'urgent' THEN 'urgent'
			               WHEN l.status = 'open' AND (l.author_kind IS NULL OR l.author_kind = 'customer')
			                    AND coalesce(l.message_at, l.created_at) <= :unansweredBefore THEN 'unanswered'
			               WHEN l.assignee_id IS NULL THEN 'unassigned'
			               WHEN l.author_kind = 'customer' THEN 'customer_replied'
			               WHEN l.priority = 'high' THEN 'high'
			               WHEN l.status = 'waiting' AND l.updated_at <= :waitingBefore THEN 'waiting'
			           END AS reason
			    FROM last_public l
			), classified AS (
			    SELECT r.id, r.number, r.reason, r.message_id,
			           CASE r.reason
			               WHEN 'unanswered' THEN coalesce(r.message_at, r.created_at)
			               WHEN 'customer_replied' THEN r.message_at
			               WHEN 'waiting' THEN r.updated_at
			               ELSE r.created_at
			           END AS since
			    FROM reasoned r
			), page AS (
			    SELECT c.id, c.number, c.reason, c.since,
			           CASE WHEN c.reason = 'customer_replied' THEN left(b.body, %d) END AS body
			    FROM classified c
			    LEFT JOIN ticket_messages b ON b.id = c.message_id
			    WHERE c.reason IS NOT NULL
			    ORDER BY array_position(CAST(:order AS text[]), c.reason), c.since, c.number DESC
			    LIMIT :size
			), counts AS (
			    SELECT count(*) AS open_total, count(reason) AS attention_total FROM classified
			)
			SELECT counts.open_total, counts.attention_total, page.id, page.reason, page.since, page.body
			FROM counts
			LEFT JOIN page ON true
			ORDER BY array_position(CAST(:order AS text[]), page.reason), page.since, page.number DESC
			""";

	private static final String MINE_ONLY = " AND t.assignee_id = :viewer";

	private static final String[] REASON_ORDER = Arrays.stream(AttentionReason.values())
		.map(WireEnum::wireValue)
		.toArray(String[]::new);

	private final JdbcClient jdbc;

	TicketAttentionQuery(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Un ticket con su motivo; {@code excerpt} solo en «el cliente respondió». */
	record Entry(UUID ticketId, AttentionReason reason, Instant since, @Nullable String excerpt) {
	}

	/**
	 * @param entries los primeros tickets con motivo, ya ordenados
	 * @param total cuántos tickets del alcance tienen motivo
	 * @param open cuántos tickets sin resolver tiene el alcance, con o sin motivo
	 */
	record Result(List<Entry> entries, int total, int open) {
	}

	/** Una fila de la consulta: los recuentos van repetidos en todas, y la entrada falta si no hay ninguna con motivo. */
	private record Row(int total, int open, @Nullable Entry entry) {
	}

	@Transactional(readOnly = true)
	Result find(UUID organizationId, UUID viewerId, AttentionScope scope, int size, Instant now) {
		JdbcClient.StatementSpec statement = this.jdbc
			.sql(QUERY.formatted((scope == AttentionScope.MINE) ? MINE_ONLY : "", MessageExcerpt.SOURCE_LENGTH))
			.param("organizationId", organizationId)
			.param("unansweredBefore", Timestamp.from(now.minus(UNANSWERED_AFTER)))
			.param("waitingBefore", Timestamp.from(now.minus(WAITING_AFTER)))
			.param("order", REASON_ORDER)
			.param("size", size);
		if (scope == AttentionScope.MINE) {
			statement = statement.param("viewer", viewerId);
		}
		// Los recuentos salen siempre, así que hay al menos una fila.
		List<Row> rows = statement.query((row, index) -> new Row(row.getInt("attention_total"),
				row.getInt("open_total"), entry(row))).list();
		List<Entry> entries = rows.stream().map(Row::entry).filter(Objects::nonNull).toList();
		return new Result(entries, rows.get(0).total(), rows.get(0).open());
	}

	private static @Nullable Entry entry(ResultSet row) throws SQLException {
		UUID id = row.getObject("id", UUID.class);
		if (id == null) {
			return null;
		}
		String body = row.getString("body");
		return new Entry(id, WireEnum.fromWire(AttentionReason.class, row.getString("reason")).orElseThrow(),
				row.getTimestamp("since").toInstant(), (body != null) ? MessageExcerpt.of(body) : null);
	}

}
