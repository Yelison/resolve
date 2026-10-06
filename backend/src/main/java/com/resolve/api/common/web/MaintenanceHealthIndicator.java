package com.resolve.api.common.web;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Parte del grupo {@code readiness} ({@code management.endpoint.health.group.readiness.include}): {@code OUT_OF_SERVICE}
 * mientras {@link MaintenanceMode} está activo, para que la plataforma no enrute tráfico. Refleja la última lectura de
 * la marca y no consulta la base de datos (ver {@link MaintenanceMode}); la liveness no lo incluye. Existe siempre,
 * porque Spring Boot falla si el grupo nombra un contribuyente que no existe; fuera de una demostración
 * ({@link MaintenanceMode} ausente) es siempre {@code UP}.
 */
@Component("maintenance")
class MaintenanceHealthIndicator implements HealthIndicator {

	private final ObjectProvider<MaintenanceMode> mode;

	MaintenanceHealthIndicator(ObjectProvider<MaintenanceMode> mode) {
		this.mode = mode;
	}

	@Override
	public Health health() {
		MaintenanceMode current = this.mode.getIfAvailable();
		return (current != null && current.activeNow()) ? Health.outOfService().build() : Health.up().build();
	}

}
