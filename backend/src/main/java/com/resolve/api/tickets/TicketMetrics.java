package com.resolve.api.tickets;

import org.jspecify.annotations.Nullable;

/** Métricas de la bandeja para toda la organización ({@code TicketMetrics} en el contrato). */
record TicketMetrics(int open, int openedToday, int inProgress, int inProgressAssignedToMe, int resolvedToday,
		int resolvedYesterday, @Nullable Integer firstResponseMinutes, int firstResponseTargetMinutes,
		ViewCounts views) {

	record ViewCounts(int all, int mine, int unassigned, int resolved) {
	}

}
