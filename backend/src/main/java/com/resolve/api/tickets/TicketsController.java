package com.resolve.api.tickets;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import com.resolve.api.common.web.SortSpec;
import com.resolve.api.tickets.TicketDtos.ActivityDto;
import com.resolve.api.tickets.TicketDtos.ActivityFeedItemDto;
import com.resolve.api.tickets.TicketDtos.MessageDto;
import com.resolve.api.tickets.TicketDtos.TicketDto;
import com.resolve.api.tickets.TicketDtos.TicketSummaryDto;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/tickets")
class TicketsController {

	static final String MERGE_PATCH_JSON = "application/merge-patch+json";

	private static final Map<String, TicketSortField> SORTABLE = Map.of("updatedAt", TicketSortField.UPDATED_AT,
			"createdAt", TicketSortField.CREATED_AT, "number", TicketSortField.NUMBER, "priority",
			TicketSortField.PRIORITY, "status", TicketSortField.STATUS);

	private static final SortSpec<TicketSortField> DEFAULT_SORT = new SortSpec<>(TicketSortField.UPDATED_AT,
			SortDirection.DESC);

	private final TicketService service;

	private final ActivityFeedQuery feed;

	TicketsController(TicketService service, ActivityFeedQuery feed) {
		this.service = service;
		this.feed = feed;
	}

	@GetMapping
	PageResponse<TicketSummaryDto> list(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String view,
			@RequestParam(name = "status", required = false) @Nullable List<String> statuses,
			@RequestParam(name = "priority", required = false) @Nullable List<String> priorities,
			@RequestParam(required = false) @Nullable String assigneeId,
			@RequestParam(required = false) @Nullable String customerId,
			@RequestParam(required = false) @Nullable String q, @RequestParam(required = false) @Nullable String page,
			@RequestParam(required = false) @Nullable String size,
			@RequestParam(required = false) @Nullable String sort) {
		List<FieldErrorDetail> errors = new ArrayList<>();
		PageQuery<TicketSortField> pageQuery = collect(errors,
				() -> PageQuery.parse(page, size, sort, SORTABLE, DEFAULT_SORT));
		TicketFilters filters = collect(errors,
				() -> TicketRequestParser.filters(view, statuses, priorities, assigneeId, customerId, q));
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

	@GetMapping("/metrics")
	TicketMetrics metrics(@AuthenticationPrincipal CurrentMember member) {
		return this.service.metrics(member);
	}

	/** El tamaño llega como texto para que un valor inválido sea un 400 sobre el campo {@code size}. */
	@GetMapping("/activity")
	List<ActivityFeedItemDto> recentActivity(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String size) {
		return this.feed.latest(member.organizationId(), ActivityFeedQuery.parseSize(size));
	}

	@PostMapping
	ResponseEntity<TicketDto> create(@AuthenticationPrincipal CurrentMember member,
			@RequestBody TicketRequests.CreateTicket request) {
		TicketDto ticket = this.service.create(member, TicketRequestParser.newTicket(request));
		URI location = ServletUriComponentsBuilder.fromCurrentContextPath()
			.path("/tickets/{number}")
			.buildAndExpand(ticket.number())
			.toUri();
		return ResponseEntity.created(location).eTag(String.valueOf(ticket.version())).body(ticket);
	}

	@GetMapping("/{number}")
	ResponseEntity<TicketDto> get(@AuthenticationPrincipal CurrentMember member, @PathVariable String number) {
		TicketDto ticket = this.service.get(member, TicketRequestParser.ticketNumber(number));
		return ResponseEntity.ok().eTag(String.valueOf(ticket.version())).body(ticket);
	}

	/** El cuerpo se valida dentro del servicio, después de buscar el ticket y comprobar If-Match. */
	@PatchMapping(path = "/{number}", consumes = { MERGE_PATCH_JSON, "application/json" })
	ResponseEntity<TicketDto> update(@AuthenticationPrincipal CurrentMember member, @PathVariable String number,
			@RequestHeader(name = "If-Match", required = false) @Nullable String ifMatch,
			@RequestBody(required = false) @Nullable JsonNode body) {
		TicketDto ticket = this.service.update(member, TicketRequestParser.ticketNumber(number), ifMatch,
				() -> TicketRequestParser.changes(body));
		return ResponseEntity.ok().eTag(String.valueOf(ticket.version())).body(ticket);
	}

	@GetMapping("/{number}/messages")
	List<MessageDto> messages(@AuthenticationPrincipal CurrentMember member, @PathVariable String number) {
		return this.service.messages(member, TicketRequestParser.ticketNumber(number));
	}

	@PostMapping("/{number}/messages")
	@ResponseStatus(HttpStatus.CREATED)
	MessageDto addMessage(@AuthenticationPrincipal CurrentMember member, @PathVariable String number,
			@RequestBody TicketRequests.CreateMessage request) {
		long ticketNumber = TicketRequestParser.ticketNumber(number);
		return this.service.addMessage(member, ticketNumber, TicketRequestParser.newMessage(request));
	}

	@GetMapping("/{number}/activity")
	List<ActivityDto> activity(@AuthenticationPrincipal CurrentMember member, @PathVariable String number) {
		return this.service.activity(member, TicketRequestParser.ticketNumber(number));
	}

}
