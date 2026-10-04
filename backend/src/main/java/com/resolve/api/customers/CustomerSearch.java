package com.resolve.api.customers;

import java.util.UUID;

import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import org.jspecify.annotations.Nullable;

public interface CustomerSearch {

	PageResponse<Customer> search(UUID organizationId, @Nullable String text, PageQuery<CustomerSortField> page);

}
