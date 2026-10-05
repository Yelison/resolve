package com.resolve.api.organizations;

import com.resolve.api.common.error.PreconditionFailedException;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.Preconditions;
import com.resolve.api.organizations.OrganizationDtos.OrganizationSettingsDto;
import com.resolve.api.organizations.OrganizationRequestParser.OrganizationChanges;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/** Casos de uso de los ajustes. La organización siempre sale del principal, nunca de la petición. */
@Service
class OrganizationService {

	private final OrganizationRepository organizations;

	private final JdbcClient jdbc;

	OrganizationService(OrganizationRepository organizations, JdbcClient jdbc) {
		this.organizations = organizations;
		this.jdbc = jdbc;
	}

	@Transactional(readOnly = true)
	OrganizationSettingsDto get(CurrentMember member) {
		return OrganizationSettingsDto.from(this.organizations.findById(member.organizationId()).orElseThrow());
	}

	/**
	 * Aplica un merge-patch. Orden de errores del contrato: 428, 400 y 412 (401 y 403 ya los resolvió la capa de
	 * seguridad). Un patch sin cambios responde 200 sin nueva versión.
	 */
	@Transactional
	OrganizationSettingsDto update(CurrentMember member, @Nullable String ifMatch, @Nullable JsonNode body) {
		Organization organization = this.organizations.lockById(member.organizationId()).orElseThrow();
		long expectedVersion = Preconditions.requireVersion(ifMatch, "ajuste de la organización");
		OrganizationChanges changes = OrganizationRequestParser.changes(body, this::databaseKnowsZone);
		if (organization.getVersion() != expectedVersion) {
			throw new PreconditionFailedException(
					"Los ajustes cambiaron desde que los abriste. Vuelve a cargarlos para ver los cambios.");
		}
		organization.edit((changes.name() != null) ? changes.name() : organization.getName(),
				changes.supportEmailChanged() ? changes.supportEmail() : organization.getSupportEmail(),
				(changes.timeZone() != null) ? changes.timeZone() : organization.getTimeZone(),
				(changes.firstResponseTargetMinutes() != null) ? changes.firstResponseTargetMinutes()
						: organization.getFirstResponseTargetMinutes());
		// El flush dentro de la transacción deja la nueva versión en la entidad antes de construir la respuesta.
		this.organizations.flush();
		return OrganizationSettingsDto.from(organization);
	}

	/** Si PostgreSQL conoce el nombre de zona tal cual, que es como lo usan las consultas de métricas e informes. */
	boolean databaseKnowsZone(String name) {
		return this.jdbc.sql("SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = :name)")
			.param("name", name)
			.query(Boolean.class)
			.single();
	}

}
