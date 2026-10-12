package com.resolve.api.organizations;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.memberships.Role;
import com.resolve.api.organizations.OrganizationDtos.GettingStartedDto;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * «Primeros pasos» de Inicio (docs/decisions/0004-workspaces.md, regla 4): invitar al equipo, añadir un cliente y
 * publicar un artículo. Se muestra a los administradores hasta que las tres están hechas y, después, nunca vuelve.
 *
 * <p>
 * <b>Qué cuenta.</b> Se prefieren condiciones que solo pasan de falso a verdadero, para que un paso hecho no se
 * deshaga: una membresía de personal de <i>otra</i> persona alguna vez (las retiradas no se borran; son al menos dos
 * personas distintas, y no depende de quién creó el espacio), un cliente alguna vez (se archivan, no se borran) y un
 * artículo publicado. Este último <b>no</b> es monótono: despublicar borra {@code published_at} y el artículo vuelve a
 * ser un borrador, sin rastro de que estuvo publicado, así que el paso depende del estado actual hasta que se
 * completan los tres. No importa para la regla de «nunca vuelve», que la garantiza {@code getting_started_done_at}.
 *
 * <p>
 * <b>Dónde se escribe {@code getting_started_done_at}.</b> En la lectura que lo descubre, no en las escrituras que
 * completan cada paso: son tres sitios de tres dominios (invitar, crear cliente, publicar), cada uno con sus
 * bloqueos, y se dejaría fuera cualquier camino que se añada después; la lectura es el único lugar donde las tres
 * condiciones se ven juntas y se arregla sola si una escritura se salta. La sentencia es idempotente
 * ({@code WHERE getting_started_done_at IS NULL}) y no puede chocar con nada: toma la fila con
 * {@code FOR NO KEY UPDATE SKIP LOCKED} (si otra transacción la retiene, el ticket que reserva su número o la edición
 * de los ajustes, no espera y se repite en la lectura siguiente), no toca {@code version} (una edición de los ajustes en
 * curso no recibe un 412 por ella) y corre sola, sin transacción abierta alrededor, así que la lectura no retiene una
 * conexión mientras pide otra. La respuesta es {@code null} en cuanto se cumplen las tres, se haya escrito o no.
 */
@Component
public class GettingStarted {

	private static final String STATE = """
			SELECT o.getting_started_done_at IS NOT NULL AS done,
				(SELECT count(DISTINCT m.user_id) FROM memberships m
					WHERE m.organization_id = o.id AND m.role <> 'customer') >= 2 AS invited_team,
				EXISTS (SELECT 1 FROM customers c WHERE c.organization_id = o.id) AS added_customer,
				EXISTS (SELECT 1 FROM articles a WHERE a.organization_id = o.id AND a.status = 'published')
					AS published_article
			FROM organizations o WHERE o.id = :organizationId
			""";

	private static final String MARK_DONE = """
			UPDATE organizations SET getting_started_done_at = ?
			WHERE id = (SELECT id FROM organizations WHERE id = ? AND getting_started_done_at IS NULL
				FOR NO KEY UPDATE SKIP LOCKED)
			""";

	private final JdbcClient jdbc;

	private final Clock clock;

	GettingStarted(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/** Los tres pasos del espacio del principal, o {@code null} si no tocan: no es administrador o ya se completó. */
	public @Nullable GettingStartedDto read(CurrentMember member) {
		if (member.role() != Role.ADMIN) {
			return null;
		}
		UUID organizationId = member.organizationId();
		GettingStartedDto steps = this.jdbc.sql(STATE)
			.param("organizationId", organizationId)
			.query((row, index) -> row.getBoolean("done") ? null
					: new GettingStartedDto(row.getBoolean("invited_team"), row.getBoolean("added_customer"),
							row.getBoolean("published_article")))
			.optional()
			.orElse(null);
		if (steps == null) {
			return null;
		}
		if (steps.invitedTeam() && steps.addedCustomer() && steps.publishedArticle()) {
			this.jdbc.sql(MARK_DONE).params(Timestamp.from(this.clock.instant()), organizationId).update();
			return null;
		}
		return steps;
	}

}
