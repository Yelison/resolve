package com.resolve.api.memberships;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.SessionOrganization;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Organización con la que trabaja la sesión. Es uno de los dos sitios donde llega un id de organización del cliente (el otro
 * es {@link MyOrganizationsController}, que sale de una), y no se confía en él: se comprueba contra las membresías de la
 * identidad ya verificada antes de guardarlo en la sesión.
 */
@RestController
class SessionController {

	private final MemberPrincipals principals;

	private final MeAssembler me;

	SessionController(MemberPrincipals principals, MeAssembler me) {
		this.principals = principals;
		this.me = me;
	}

	@GetMapping("/session/organizations")
	List<OrganizationRefDto> organizations(@AuthenticationPrincipal CurrentMember member) {
		return this.principals.organizationsOf(member.email());
	}

	/**
	 * Una organización ajena, una sin membresía utilizable y una que no existe dan la misma respuesta 403, así que no
	 * se revela cuáles existen. La elección solo se guarda después de resolver el principal en ella.
	 */
	@PostMapping("/session/organization")
	ResponseEntity<?> select(@AuthenticationPrincipal CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body, HttpServletRequest request) {
		UUID organizationId = MemberRequestParser.sessionOrganization(body);
		Optional<CurrentMember> chosen = this.principals.resolveIn(member.email(), organizationId);
		if (chosen.isEmpty()) {
			ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
					"No puedes trabajar en esa organización.");
			problem.setTitle("Sin permiso");
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body(problem);
		}
		SessionOrganization.write(request, organizationId);
		return ResponseEntity.ok(this.me.assemble(chosen.get()));
	}

}
