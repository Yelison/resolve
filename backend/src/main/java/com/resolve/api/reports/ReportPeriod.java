package com.resolve.api.reports;

import com.resolve.api.common.error.ApiValidationException;
import org.jspecify.annotations.Nullable;

/** Duración de un informe en días naturales de la organización, tal como la declara el parámetro {@code period}. */
enum ReportPeriod {

	SEVEN_DAYS("7d", 7), THIRTY_DAYS("30d", 30), NINETY_DAYS("90d", 90);

	private final String wireValue;

	private final int days;

	ReportPeriod(String wireValue, int days) {
		this.wireValue = wireValue;
		this.days = days;
	}

	int days() {
		return this.days;
	}

	/** Un valor ausente o en blanco es el periodo por defecto, {@code 7d}; cualquier otro debe ser exacto. */
	static ReportPeriod parse(@Nullable String value) {
		if (value == null || value.isBlank()) {
			return SEVEN_DAYS;
		}
		for (ReportPeriod period : values()) {
			if (period.wireValue.equals(value)) {
				return period;
			}
		}
		throw new ApiValidationException("period", "Usa 7d, 30d o 90d.");
	}

}
