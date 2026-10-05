package com.resolve.api.customers;

import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;

public interface CustomerSearch {

	PageResponse<CustomerRow> search(UUID organizationId, CustomerFilters filters, PageQuery<CustomerSortField> page);

	/** Un cliente de la organización con sus recuentos; uno ajeno o inexistente no aparece. */
	Optional<CustomerRow> findWithCounts(UUID organizationId, UUID id);

}
