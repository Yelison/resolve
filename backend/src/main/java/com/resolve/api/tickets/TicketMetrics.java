package com.resolve.api.tickets;

import com.resolve.api.organizations.OrganizationDtos.GettingStartedDto;
import org.jspecify.annotations.Nullable;

/**
 * Métricas de la bandeja para toda la organización ({@code TicketMetrics} en el contrato). Es la respuesta que
 * alimenta Inicio, y por eso lleva también {@code gettingStarted}: Inicio no tiene una respuesta propia, se compone
 * de esta, los tickets que necesitan atención, el resumen de reportes y la actividad.
 */
record TicketMetrics(int open, int openedToday, int inProgress, int inProgressAssignedToMe, int resolvedToday,
		int resolvedYesterday, int unassignedOver4Hours, @Nullable Integer firstResponseMinutes,
		int firstResponseTargetMinutes, ViewCounts views, @Nullable GettingStartedDto gettingStarted) {

	TicketMetrics withGettingStarted(@Nullable GettingStartedDto steps) {
		return new TicketMetrics(this.open, this.openedToday, this.inProgress, this.inProgressAssignedToMe,
				this.resolvedToday, this.resolvedYesterday, this.unassignedOver4Hours, this.firstResponseMinutes,
				this.firstResponseTargetMinutes, this.views, steps);
	}

	record ViewCounts(int all, int mine, int unassigned, int resolved) {
	}

}
