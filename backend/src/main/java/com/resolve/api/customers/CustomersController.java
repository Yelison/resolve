package com.resolve.api.customers;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import com.resolve.api.common.web.SortSpec;
import com.resolve.api.customers.CustomerDtos.CustomerDetailDto;
import com.resolve.api.customers.CustomerDtos.CustomerMetricsDto;
import com.resolve.api.customers.CustomerDtos.CustomerSummaryDto;
import com.resolve.api.memberships.MemberDtos.TeamMemberDto;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.JsonNode;

@RestController
class CustomersController {

	static final String MERGE_PATCH_JSON = "application/merge-patch+json";

	private static final Map<String, CustomerSortField> SORTABLE = Map.of("name", CustomerSortField.NAME, "createdAt",
			CustomerSortField.CREATED_AT, "openTickets", CustomerSortField.OPEN_TICKETS);

	private static final SortSpec<CustomerSortField> DEFAULT_SORT = new SortSpec<>(CustomerSortField.NAME,
			SortDirection.ASC);

	private final CustomerService service;

	CustomersController(CustomerService service) {
		this.service = service;
	}

	@GetMapping("/customers")
	PageResponse<CustomerSummaryDto> list(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String q,
			@RequestParam(required = false) @Nullable String company,
			@RequestParam(required = false) @Nullable String archived,
			@RequestParam(required = false) @Nullable String page, @RequestParam(required = false) @Nullable String size,
			@RequestParam(required = false) @Nullable String sort) {
		List<FieldErrorDetail> errors = new ArrayList<>();
		PageQuery<CustomerSortField> pageQuery = collect(errors,
				() -> PageQuery.parse(page, size, sort, SORTABLE, DEFAULT_SORT));
		CustomerFilters filters = collect(errors, () -> CustomerRequestParser.filters(q, company, archived));
		if (!errors.isEmpty()) {
			throw new ApiValidationException(errors);
		}
		return this.service.list(member, filters, pageQuery);
	}

	/** Ejecuta un análisis y acumula sus errores para responder todos juntos. */
	private static <T> @Nullable T collect(List<FieldErrorDetail> errors, Supplier<T> parser) {
		try {
			return parser.get();
		}
		catch (ApiValidationException exception) {
			errors.addAll(exception.errors());
			return null;
		}
	}

	@GetMapping("/customers/metrics")
	CustomerMetricsDto metrics(@AuthenticationPrincipal CurrentMember member) {
		return this.service.metrics(member);
	}

	@GetMapping("/customers/companies")
	List<String> companies(@AuthenticationPrincipal CurrentMember member) {
		return this.service.companies(member);
	}

	@PostMapping("/customers")
	ResponseEntity<CustomerDetailDto> create(@AuthenticationPrincipal CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body) {
		CustomerDetailDto customer = this.service.create(member, CustomerRequestParser.newCustomer(body));
		URI location = ServletUriComponentsBuilder.fromCurrentContextPath()
			.path("/customers/{id}")
			.buildAndExpand(customer.id())
			.toUri();
		return ResponseEntity.created(location).eTag(String.valueOf(customer.version())).body(customer);
	}

	@GetMapping("/customers/{id}")
	ResponseEntity<CustomerDetailDto> get(@AuthenticationPrincipal CurrentMember member, @PathVariable String id) {
		CustomerDetailDto customer = this.service.get(member, CustomerRequestParser.customerId(id));
		return ResponseEntity.ok().eTag(String.valueOf(customer.version())).body(customer);
	}

	/** El cuerpo se valida dentro del servicio, después de buscar el cliente y comprobar If-Match. */
	@PatchMapping(path = "/customers/{id}", consumes = { MERGE_PATCH_JSON, "application/json" })
	ResponseEntity<CustomerDetailDto> update(@AuthenticationPrincipal CurrentMember member,
			@PathVariable String id, @RequestHeader(name = "If-Match", required = false) @Nullable String ifMatch,
			@RequestBody(required = false) @Nullable JsonNode body) {
		CustomerDetailDto customer = this.service.update(member, CustomerRequestParser.customerId(id), ifMatch,
				() -> CustomerRequestParser.changes(body));
		return ResponseEntity.ok().eTag(String.valueOf(customer.version())).body(customer);
	}

	@PostMapping("/customers/{id}/archive")
	ResponseEntity<CustomerDetailDto> archive(@AuthenticationPrincipal CurrentMember member,
			@PathVariable String id) {
		CustomerDetailDto customer = this.service.archive(member, CustomerRequestParser.customerId(id));
		return ResponseEntity.ok().eTag(String.valueOf(customer.version())).body(customer);
	}

	@PostMapping("/customers/{id}/restore")
	ResponseEntity<CustomerDetailDto> restore(@AuthenticationPrincipal CurrentMember member,
			@PathVariable String id) {
		CustomerDetailDto customer = this.service.restore(member, CustomerRequestParser.customerId(id));
		return ResponseEntity.ok().eTag(String.valueOf(customer.version())).body(customer);
	}

	@PostMapping("/customers/{id}/invite")
	ResponseEntity<TeamMemberDto> invite(@AuthenticationPrincipal CurrentMember member, @PathVariable String id) {
		TeamMemberDto invited = this.service.invite(member, CustomerRequestParser.customerId(id));
		return ResponseEntity.status(HttpStatus.CREATED).body(invited);
	}

}
