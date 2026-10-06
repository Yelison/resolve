package com.resolve.api.memberships;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.SessionOrganization;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
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
 * Organización con la que trabaja la sesión. Es el único sitio donde llega un id de organización del cliente, y no se
 * confía en él: se comprueba contra las membresías de la identidad ya verificada antes de guardarlo en la sesión.
 */
@RestController
class SessionController {

	private final MemberPrincipals principals;

	private final OrganizationRepository organizations;

	private final boolean demo;

	SessionController(MemberPrincipals principals, OrganizationRepository organizations,
			@Value("${resolve.demo.enabled}") boolean demo) {
		this.demo = demo;
		this.principals = principals;
		this.organizations = organizations;
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
		return ResponseEntity.ok(me(chosen.get()));
	}

	private MeController.MeResponse me(CurrentMember member) {
		Organization organization = this.organizations.findById(member.organizationId()).orElseThrow();
		return new MeController.MeResponse(new MemberDto(member.userId(), member.name(), member.email()),
				MeController.organizationDto(organization, this.demo), this.principals.organizationsOf(member.email()),
				member.role(), member.customerId());
	}

}
