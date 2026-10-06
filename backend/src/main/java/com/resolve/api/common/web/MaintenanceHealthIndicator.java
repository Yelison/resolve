package com.resolve.api.common.web;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Parte del grupo {@code readiness} ({@code management.endpoint.health.group.readiness.include}): {@code OUT_OF_SERVICE}
 * mientras {@link MaintenanceMode} está activo, para que la plataforma no enrute tráfico. Fuera de mantenimiento refleja la
 * última lectura de la marca sin consultar la base de datos; mientras dura, la relee como mucho cada 5 s (ver
 * {@link MaintenanceMode}); la liveness no lo incluye. Existe siempre,
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
		// Fuera de mantenimiento no se consulta la base de datos (Neon puede suspenderse). Mientras la última lectura dice que
		// sí lo hay, `active()` la relee si tiene más de 5 s: así la readiness vuelve a UP sin esperar a una petición a la API.
		boolean maintenance = current != null && current.activeNow() && current.active();
		return maintenance ? Health.outOfService().build() : Health.up().build();
	}

}
