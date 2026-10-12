package com.resolve.api.memberships;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;

import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.error.ProblemTypes;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.OrganizationColors;
import com.resolve.api.organizations.OrganizationRequestParser.NewOrganization;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Crear espacios (docs/decisions/0004-workspaces.md, reglas 3 y 4): puede quien tiene una membresía {@code admin} activa
 * en algún espacio, y cada persona tiene como mucho {@code resolve.organizations.per-person-limit} (3) espacios
 * <i>creados por ella en los que sigue activa</i>: salir de uno que creó devuelve el cupo, y los espacios a los que la
 * invitaron no cuentan. {@code Me.organizationCreation} lee el mismo cálculo, así que la interfaz no lo repite.
 *
 * <p>
 * El límite es exacto con dos peticiones a la vez porque crear toma el bloqueo por persona de {@link UserLocks}, el
 * mismo que salir de un espacio, antes de contar.
 */
@Service
class WorkspaceService {

	private static final String NOT_ALLOWED = "Solo los administradores pueden crear espacios.";

	private static final String LIMIT_REACHED = "Has llegado al máximo de espacios que puedes crear.";

	private static final String STANDING = """
			SELECT EXISTS (SELECT 1 FROM memberships WHERE user_id = :userId AND role = 'admin' AND status = 'active')
					AS admin,
				(SELECT count(*) FROM organizations o
					JOIN memberships m ON m.organization_id = o.id AND m.user_id = o.created_by
					WHERE o.created_by = :userId AND m.status = 'active') AS created
			""";

	private record Standing(boolean admin, int created) {
	}

	private final JdbcClient jdbc;

	private final Clock clock;

	private final int limit;

	WorkspaceService(JdbcClient jdbc, Clock clock,
			@Value("${resolve.organizations.per-person-limit:3}") int limit) {
		if (limit < 1) {
			throw new IllegalStateException("resolve.organizations.per-person-limit debe ser al menos 1.");
		}
		this.jdbc = jdbc;
		this.clock = clock;
		this.limit = limit;
	}

	/** {@code allowed} ya incluye el rol y el límite; {@code created} y {@code limit} son para «Has creado N de M». */
	MeController.OrganizationCreationDto creation(UUID userId) {
		Standing standing = standing(userId);
		return new MeController.OrganizationCreationDto(standing.admin() && standing.created() < this.limit,
				standing.created(), this.limit);
	}

	/**
	 * Crea el espacio con quien llama como administrador activo y devuelve el principal en él. 403 si no es
	 * administrador de ningún espacio y 409 {@code organization-limit} si ya llegó al límite. Los demás valores son los
	 * del esquema; el color sale del id ({@link OrganizationColors#forId}).
	 */
	@Transactional
	CurrentMember create(CurrentMember caller, NewOrganization request) {
		UserLocks.lockMemberships(this.jdbc, caller.userId());
		Standing standing = standing(caller.userId());
		if (!standing.admin()) {
			throw new AccessDeniedException(NOT_ALLOWED);
		}
		if (standing.created() >= this.limit) {
			throw new ConflictException(LIMIT_REACHED, ProblemTypes.ORGANIZATION_LIMIT);
		}
		UUID organizationId = Ids.newId();
		this.jdbc
			.sql("INSERT INTO organizations (id, name, time_zone, color, created_by) VALUES (?, ?, ?, ?, ?)")
			.params(organizationId, request.name(), request.timeZone(), OrganizationColors.forId(organizationId),
					caller.userId())
			.update();
		this.jdbc.sql("""
				INSERT INTO memberships (id, organization_id, user_id, role, customer_id, status, joined_at)
				VALUES (?, ?, ?, 'admin', NULL, 'active', ?)
				""")
			.params(Ids.newId(), organizationId, caller.userId(), Timestamp.from(this.clock.instant()))
			.update();
		return new CurrentMember(caller.userId(), caller.name(), caller.email(), organizationId, Role.ADMIN, null);
	}

	private Standing standing(UUID userId) {
		return this.jdbc.sql(STANDING)
			.param("userId", userId)
			.query((row, index) -> new Standing(row.getBoolean("admin"), row.getInt("created")))
			.single();
	}

}
