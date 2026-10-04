package com.resolve.api.tickets;

import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;

interface TicketSearch {

	PageResponse<Ticket> search(TicketScope scope, TicketFilters filters, PageQuery<TicketSortField> page);

}
