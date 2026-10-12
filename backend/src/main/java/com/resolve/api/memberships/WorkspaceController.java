package com.resolve.api.memberships;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.PrincipalResolver;
import com.resolve.api.common.security.SessionOrganization;
import com.resolve.api.common.security.VerifiedIdentity;
import com.resolve.api.organizations.OrganizationRequestParser;
import com.resolve.api.organizations.OrganizationRequestParser.NewOrganization;
import com.resolve.api.organizations.TimeZones;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Crear un espacio. La seguridad deja pasar a cualquier persona autenticada: el 403 de quien no administra ningún espacio
 * lo decide el servicio, con sus membresías, no la seguridad con el rol de la sesión (un administrador puede estar
 * trabajando ahora en un espacio donde es cliente). Por eso el cuerpo se valida antes que el permiso.
 *
 * <p>
 * Es la única ruta que puede llamar alguien que todavía no es miembro de nada: con el alta abierta
 * ({@code resolve.organizations.creation=open}) la regla de seguridad admite a una {@link VerifiedIdentity} sin
 * membresías, que no llega como {@code @AuthenticationPrincipal} (no hay principal) sino como atributo de la petición.
 */
@RestController
class WorkspaceController {

	private final WorkspaceService service;

	private final MeAssembler me;

	private final JdbcClient jdbc;

	WorkspaceController(WorkspaceService service, MeAssembler me, JdbcClient jdbc) {
		this.service = service;
		this.me = me;
		this.jdbc = jdbc;
	}

	/**
	 * Ignora {@code X-Organization-Id}, como {@code POST /session/organization}: es lo que cambia la organización. La
	 * sesión pasa al espacio nuevo cuando la creación ya está confirmada.
	 */
	@PostMapping("/organizations")
	ResponseEntity<MeController.MeResponse> create(@AuthenticationPrincipal @Nullable CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body, HttpServletRequest request) {
		// La zona se consulta antes de la transacción y del bloqueo: no necesita nada de lo que protegen.
		NewOrganization input = OrganizationRequestParser.creation(body,
				(zone) -> TimeZones.databaseKnows(this.jdbc, zone));
		CurrentMember created;
		if (member != null) {
			created = this.service.create(member, input);
		}
		else if (request.getAttribute(PrincipalResolver.IDENTITY_ATTRIBUTE) instanceof VerifiedIdentity identity) {
			created = this.service.create(identity, input);
		}
		else {
			// La regla de seguridad no deja llegar aquí sin una de las dos; si una regla futura lo permitiera, mejor un 403
			// que un alta sin dueño.
			throw new AccessDeniedException("Tu rol no permite esta acción.");
		}
		SessionOrganization.write(request, created.organizationId());
		return ResponseEntity.status(HttpStatus.CREATED).body(this.me.assemble(created));
	}

}
