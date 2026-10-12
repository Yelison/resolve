package com.resolve.api.organizations;

import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Cuerpos de respuesta de los ajustes de la organización. */
public final class OrganizationDtos {

	private OrganizationDtos() {
	}

	/**
	 * Los tres pasos de «Primeros pasos» de Inicio ({@code GettingStarted} en el contrato); {@code null} donde no se
	 * muestra.
	 */
	public record GettingStartedDto(boolean invitedTeam, boolean addedCustomer, boolean publishedArticle) {
	}

	/** Ajustes editables de la organización; {@code version} es el mismo valor que la cabecera ETag. */
	public record OrganizationSettingsDto(UUID id, String name, @Nullable String supportEmail, String timeZone,
			int firstResponseTargetMinutes, String color, long version) {

		static OrganizationSettingsDto from(Organization organization) {
			return new OrganizationSettingsDto(organization.getId(), organization.getName(),
					organization.getSupportEmail(), organization.getTimeZone(),
					organization.getFirstResponseTargetMinutes(), organization.getColor(), organization.getVersion());
		}

	}

}
