package com.resolve.api.reports;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.reports.ReportDtos.ReportSummaryDto;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Informes de la organización: solo lectura y solo para el personal (la regla de URL está en seguridad). */
@RestController
class ReportsController {

	private final ReportSummaryQuery query;

	ReportsController(ReportSummaryQuery query) {
		this.query = query;
	}

	/** El periodo llega como texto para que un valor inválido sea un 400 sobre el campo {@code period}. */
	@GetMapping("/reports/summary")
	ReportSummaryDto summary(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String period) {
		return this.query.compute(member.organizationId(), ReportPeriod.parse(period));
	}

}
