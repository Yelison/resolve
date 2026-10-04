package com.resolve.api.customers;

import java.util.Map;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import com.resolve.api.common.web.SortSpec;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class CustomersController {

	static final int MAX_QUERY_LENGTH = 120;

	private static final Map<String, CustomerSortField> SORTABLE = Map.of("name", CustomerSortField.NAME);

	private static final SortSpec<CustomerSortField> DEFAULT_SORT = new SortSpec<>(CustomerSortField.NAME,
			SortDirection.ASC);

	private final CustomerRepository customers;

	CustomersController(CustomerRepository customers) {
		this.customers = customers;
	}

	@GetMapping("/customers")
	@Transactional(readOnly = true)
	PageResponse<CustomerDto> search(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String q, @RequestParam(required = false) @Nullable String page,
			@RequestParam(required = false) @Nullable String size,
			@RequestParam(required = false) @Nullable String sort) {
		PageQuery<CustomerSortField> query = PageQuery.parse(page, size, sort, SORTABLE, DEFAULT_SORT);
		if (q != null && q.length() > MAX_QUERY_LENGTH) {
			throw new ApiValidationException("q", "La búsqueda admite como máximo " + MAX_QUERY_LENGTH + " caracteres.");
		}
		return this.customers.search(member.organizationId(), q, query).map(CustomerDto::from);
	}

}
