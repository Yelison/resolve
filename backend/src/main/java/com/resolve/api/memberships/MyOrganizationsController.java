package com.resolve.api.memberships;

import com.resolve.api.common.security.CurrentMember;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Las organizaciones de quien llama. La seguridad la deja pasar a cualquier persona autenticada: el 403 de un cliente
 * y el 404 de una organización que no es suya los decide el servicio, no el rol.
 */
@RestController
class MyOrganizationsController {

	private final MemberService service;

	MyOrganizationsController(MemberService service) {
		this.service = service;
	}

	/** Salir de una organización; también de la de la propia sesión. */
	@DeleteMapping("/me/organizations/{organizationId}")
	ResponseEntity<Void> leave(@AuthenticationPrincipal CurrentMember member, @PathVariable String organizationId) {
		this.service.leave(member, MemberRequestParser.organizationId(organizationId));
		return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
	}

}
