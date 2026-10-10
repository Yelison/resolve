package com.resolve.api.reports;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.memberships.MemberRefDto;
import com.resolve.api.memberships.MemberStatus;
import com.resolve.api.tickets.TicketChannel;
import org.jspecify.annotations.Nullable;

/** DTOs del informe tal como los define el contrato ({@code ReportSummary}). */
final class ReportDtos {

	private ReportDtos() {
	}

	record ReportSummaryDto(Range period, Count created, Count resolved, FirstResponse firstResponseMinutes,
			Resolution resolutionHours, List<Day> byDay, List<Channel> byChannel, List<Agent> byAgent,
			StatusCounts openByStatus, PriorityCounts openByPriority, List<ResolutionTime> resolutionTimes,
			List<WeekdayHour> createdByWeekdayHour) {
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

	record Agent(MemberRefDto member, MemberStatus status, int resolved, @Nullable Integer firstResponseMinutes, int openAssigned) {
	}

	/** Tickets sin resolver ahora, por estado: una foto actual que no depende del periodo. */
	record StatusCounts(int open, int inProgress, int waiting) {
	}

	/** Tickets sin resolver ahora, por su prioridad actual. */
	record PriorityCounts(int urgent, int high, int medium, int low) {
	}

	/** Tramos de tiempo hasta la primera resolución, siempre los seis y en este orden; límites {@code [min, max)}. */
	enum ResolutionBucket {

		UNDER_1H("under1h"), FROM_1_TO_4H("from1To4h"), FROM_4_TO_8H("from4To8h"), FROM_8_TO_24H("from8To24h"),
		FROM_1_TO_3D("from1To3d"), OVER_3D("over3d");

		private final String wireValue;

		ResolutionBucket(String wireValue) {
			this.wireValue = wireValue;
		}

		@JsonValue
		String wireValue() {
			return this.wireValue;
		}

	}

	record ResolutionTime(ResolutionBucket bucket, int resolved) {
	}

	/** Una celda dispersa del mapa: día ISO ({@code 1} lunes … {@code 7} domingo) y hora local, con al menos un ticket. */
	record WeekdayHour(int weekday, int hour, int created) {
	}

}
