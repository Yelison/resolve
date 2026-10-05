package com.resolve.api.reports;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.resolve.api.memberships.MemberRefDto;
import com.resolve.api.tickets.TicketChannel;
import org.jspecify.annotations.Nullable;

/** DTOs del informe tal como los define el contrato ({@code ReportSummary}). */
final class ReportDtos {

	private ReportDtos() {
	}

	record ReportSummaryDto(Range period, Count created, Count resolved, FirstResponse firstResponseMinutes,
			Resolution resolutionHours, List<Day> byDay, List<Channel> byChannel, List<Agent> byAgent) {
	}

	record Range(Instant from, Instant to, int days, String timeZone) {
	}

	record Count(int value, int previous) {
	}

	record FirstResponse(@Nullable Integer value, @Nullable Integer previous, int target) {
	}

	record Resolution(@Nullable BigDecimal value, @Nullable BigDecimal previous) {
	}

	record Day(LocalDate date, int created, int resolved) {
	}

	record Channel(TicketChannel channel, int created, BigDecimal share) {
	}

	record Agent(MemberRefDto member, int resolved, @Nullable Integer firstResponseMinutes, int openAssigned) {
	}

}
