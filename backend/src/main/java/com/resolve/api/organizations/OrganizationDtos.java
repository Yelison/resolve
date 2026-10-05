package com.resolve.api.organizations;

import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Cuerpos de respuesta de los ajustes de la organización. */
public final class OrganizationDtos {

	private OrganizationDtos() {
	}

	/** Ajustes editables de la organización; {@code version} es el mismo valor que la cabecera ETag. */
	public record OrganizationSettingsDto(UUID id, String name, @Nullable String supportEmail, String timeZone,
			int firstResponseTargetMinutes, long version) {

		static OrganizationSettingsDto from(Organization organization) {
			return new OrganizationSettingsDto(organization.getId(), organization.getName(),
					organization.getSupportEmail(), organization.getTimeZone(),
					organization.getFirstResponseTargetMinutes(), organization.getVersion());
		}

	}

}
