package com.resolve.api.customers;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;

public interface CustomerSearch {

	PageResponse<CustomerRow> search(UUID organizationId, CustomerFilters filters, PageQuery<CustomerSortField> page);

	/** Los clientes de la organización con ese id, con sus recuentos y su último ticket; sin orden garantizado. */
	List<CustomerRow> findAllWithCounts(UUID organizationId, Collection<UUID> ids);

	/** Un cliente de la organización con sus recuentos; uno ajeno o inexistente no aparece. */
	Optional<CustomerRow> findWithCounts(UUID organizationId, UUID id);

}
