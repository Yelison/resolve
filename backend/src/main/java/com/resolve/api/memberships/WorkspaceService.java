package com.resolve.api.memberships;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;

import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.error.ProblemTypes;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.OrganizationCreationPolicy;
import com.resolve.api.common.security.VerifiedIdentity;
import com.resolve.api.organizations.OrganizationColors;
import com.resolve.api.organizations.OrganizationRequestParser.NewOrganization;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Crear espacios (docs/decisions/0004-workspaces.md, decisión 1-D y reglas 3 y 4): con {@code resolve.organizations.creation}
 * en {@code admins} (por defecto) puede quien tiene una membresía {@code admin} activa en algún espacio; en {@code open},
 * cualquier identidad verificada, también quien solo es agente o cliente y quien no tiene ningún espacio. En los dos
 * modos cada persona tiene como mucho {@code resolve.organizations.per-person-limit} (3) espacios <i>creados por ella en
 * los que sigue activa</i>: salir de uno que creó devuelve el cupo, y los espacios a los que la invitaron no cuentan.
 * {@code Me.organizationCreation} lee el mismo cálculo, así que la interfaz no lo repite.
 *
 * <p>
 * El límite es exacto con dos peticiones a la vez porque crear toma el bloqueo por persona de {@link UserLocks}, el
 * mismo que salir de un espacio, antes de contar. Quien aún no tiene cuenta ni espacio (una {@link VerifiedIdentity})
 * entra por el mismo camino: su cuenta se crea (o se encuentra) en la misma transacción y antes del bloqueo, que es por
 * persona y necesita su id.
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

	private final UserDirectory users;

	private final OrganizationCreationPolicy policy;

	private final int limit;

	WorkspaceService(JdbcClient jdbc, Clock clock, UserDirectory users, OrganizationCreationPolicy policy,
			@Value("${resolve.organizations.per-person-limit:3}") int limit) {
		if (limit < 1) {
			throw new IllegalStateException("resolve.organizations.per-person-limit debe ser al menos 1.");
		}
		this.jdbc = jdbc;
		this.clock = clock;
		this.users = users;
		this.policy = policy;
		this.limit = limit;
	}

	/**
	 * {@code allowed} ya incluye el modo, el rol y el límite; {@code created} y {@code limit} son para «Has creado N de M».
	 */
	MeController.OrganizationCreationDto creation(UUID userId) {
		Standing standing = standing(userId);
		return new MeController.OrganizationCreationDto(mayCreate(standing) && standing.created() < this.limit,
				standing.created(), this.limit);
	}

	/** El modo y el rol, sin el límite: en {@code open} basta con ser una identidad verificada. */
	private boolean mayCreate(Standing standing) {
		return this.policy.isOpen() || standing.admin();
	}

	/**
	 * Crea el espacio con quien llama como administrador activo y devuelve el principal en él. 403 si el modo y sus
	 * membresías no se lo permiten (en {@code admins}, no es administrador de ningún espacio) y 409
	 * {@code organization-limit} si ya llegó al límite. Los demás valores son los del esquema; el color sale del id
	 * ({@link OrganizationColors#forId}).
	 */
	@Transactional
	CurrentMember create(CurrentMember caller, NewOrganization request) {
		return create(caller.userId(), caller.name(), caller.email(), request);
	}

	/**
	 * Lo mismo para una identidad verificada sin ninguna membresía, que no es un {@link CurrentMember}: solo con el alta
	 * abierta (la regla de seguridad ya lo exige; aquí se vuelve a comprobar, porque es la que escribe). Su cuenta se
	 * crea si no existe, y si dos altas de la misma persona nueva llegan a la vez, la segunda espera en el índice único
	 * del correo y las dos comparten después el bloqueo por persona.
	 */
	@Transactional
	CurrentMember create(VerifiedIdentity identity, NewOrganization request) {
		if (!this.policy.isOpen()) {
			throw new AccessDeniedException(NOT_ALLOWED);
		}
		UserAccount user = this.users.findOrCreate(identity.name(), identity.email());
		return create(user.getId(), user.getName(), user.getEmail(), request);
	}

	private CurrentMember create(UUID userId, String name, String email, NewOrganization request) {
		UserLocks.lockMemberships(this.jdbc, userId);
		Standing standing = standing(userId);
		if (!mayCreate(standing)) {
			throw new AccessDeniedException(NOT_ALLOWED);
		}
		if (standing.created() >= this.limit) {
			throw new ConflictException(LIMIT_REACHED, ProblemTypes.ORGANIZATION_LIMIT);
		}
		UUID organizationId = Ids.newId();
		this.jdbc
			.sql("INSERT INTO organizations (id, name, time_zone, color, created_by) VALUES (?, ?, ?, ?, ?)")
			.params(organizationId, request.name(), request.timeZone(), OrganizationColors.forId(organizationId),
					userId)
			.update();
		this.jdbc.sql("""
				INSERT INTO memberships (id, organization_id, user_id, role, customer_id, status, joined_at)
				VALUES (?, ?, ?, 'admin', NULL, 'active', ?)
				""")
			.params(Ids.newId(), organizationId, userId, Timestamp.from(this.clock.instant()))
			.update();
		return new CurrentMember(userId, name, email, organizationId, Role.ADMIN, null);
	}

	private Standing standing(UUID userId) {
		return this.jdbc.sql(STANDING)
			.param("userId", userId)
			.query((row, index) -> new Standing(row.getBoolean("admin"), row.getInt("created")))
			.single();
	}

}
