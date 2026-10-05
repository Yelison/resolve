package com.resolve.api.organizations;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.OrganizationDtos.OrganizationSettingsDto;
import org.jspecify.annotations.Nullable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Ajustes de la organización del principal: los lee el personal y solo los administradores los editan. */
@RestController
class OrganizationController {

	static final String MERGE_PATCH_JSON = "application/merge-patch+json";

	private final OrganizationService service;

	OrganizationController(OrganizationService service) {
		this.service = service;
	}

	@GetMapping("/organization")
	ResponseEntity<OrganizationSettingsDto> get(@AuthenticationPrincipal CurrentMember member) {
		return settings(this.service.get(member));
	}

	/** El cuerpo se valida dentro del servicio, después de comprobar If-Match. */
	@PatchMapping(path = "/organization", consumes = { MERGE_PATCH_JSON, "application/json" })
	ResponseEntity<OrganizationSettingsDto> update(@AuthenticationPrincipal CurrentMember member,
			@RequestHeader(name = "If-Match", required = false) @Nullable String ifMatch,
			@RequestBody(required = false) @Nullable JsonNode body) {
		return settings(this.service.update(member, ifMatch, body));
	}

	private static ResponseEntity<OrganizationSettingsDto> settings(OrganizationSettingsDto settings) {
		return ResponseEntity.ok().eTag(String.valueOf(settings.version())).body(settings);
	}

}
