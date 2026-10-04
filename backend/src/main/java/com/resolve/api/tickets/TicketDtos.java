package com.resolve.api.tickets;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.customers.CustomerDto;
import com.resolve.api.memberships.MemberRefDto;
import org.jspecify.annotations.Nullable;

/** DTOs de tickets tal como los define el contrato. Las entidades nunca salen de la capa de servicio. */
final class TicketDtos {

	private TicketDtos() {
	}

	record TicketSummaryDto(UUID id, long number, String subject, TicketStatus status, TicketPriority priority,
			TicketChannel channel, CustomerDto customer, @Nullable MemberRefDto assignee, Instant createdAt,
			Instant updatedAt) {

		static TicketSummaryDto from(Ticket ticket) {
			return new TicketSummaryDto(ticket.getId(), ticket.getNumber(), ticket.getSubject(), ticket.getStatus(),
					ticket.getPriority(), ticket.getChannel(), CustomerDto.from(ticket.getCustomer()),
					(ticket.getAssignee() != null) ? MemberRefDto.from(ticket.getAssignee()) : null,
					ticket.getCreatedAt(), ticket.getUpdatedAt());
		}

	}

	record TicketDto(UUID id, long number, String subject, TicketStatus status, TicketPriority priority,
			TicketChannel channel, CustomerDto customer, @Nullable MemberRefDto assignee, Instant createdAt,
			Instant updatedAt, String description, long version) {

		static TicketDto from(Ticket ticket) {
			return new TicketDto(ticket.getId(), ticket.getNumber(), ticket.getSubject(), ticket.getStatus(),
					ticket.getPriority(), ticket.getChannel(), CustomerDto.from(ticket.getCustomer()),
					(ticket.getAssignee() != null) ? MemberRefDto.from(ticket.getAssignee()) : null,
					ticket.getCreatedAt(), ticket.getUpdatedAt(), ticket.getDescription(), ticket.getVersion());
		}

	}

	record MessageAuthorDto(UUID id, String name, AuthorKind kind) {
	}

	record MessageDto(UUID id, String body, MessageVisibility visibility, MessageAuthorDto author, Instant createdAt) {

		static MessageDto from(TicketMessage message) {
			MessageAuthorDto author = (message.getAuthorKind() == AuthorKind.AGENT)
					? new MessageAuthorDto(message.getAuthorUser().getId(), message.getAuthorUser().getName(),
							AuthorKind.AGENT)
					: new MessageAuthorDto(message.getAuthorCustomer().getId(), message.getAuthorCustomer().getName(),
							AuthorKind.CUSTOMER);
			return new MessageDto(message.getId(), message.getBody(), message.getVisibility(), author,
					message.getCreatedAt());
		}

	}

	/** Entrada del historial: unión discriminada por {@code type}, como en el contrato. */
	sealed interface ActivityDto permits CreatedActivityDto, StatusChangedActivityDto, PriorityChangedActivityDto,
			AssigneeChangedActivityDto {

		static ActivityDto from(TicketActivity activity) {
			MemberRefDto actor = new MemberRefDto(activity.getActorUserId(), activity.getActorName());
			return switch (activity.getType()) {
				case CREATED -> new CreatedActivityDto(activity.getId(), "created", actor, activity.getCreatedAt());
				case STATUS_CHANGED -> new StatusChangedActivityDto(activity.getId(), "status_changed", actor,
						wire(TicketStatus.class, activity.getFromValue()), wire(TicketStatus.class, activity.getToValue()),
						activity.getCreatedAt());
				case PRIORITY_CHANGED -> new PriorityChangedActivityDto(activity.getId(), "priority_changed", actor,
						wire(TicketPriority.class, activity.getFromValue()),
						wire(TicketPriority.class, activity.getToValue()), activity.getCreatedAt());
				case ASSIGNEE_CHANGED -> new AssigneeChangedActivityDto(activity.getId(), "assignee_changed", actor,
						ref(activity.getFromAssigneeId(), activity.getFromAssigneeName()),
						ref(activity.getToAssigneeId(), activity.getToAssigneeName()), activity.getCreatedAt());
			};
		}

		private static <E extends Enum<E> & WireEnum> E wire(Class<E> type,
				@Nullable String value) {
			return WireEnum.fromWire(type, String.valueOf(value)).orElseThrow();
		}

		private static @Nullable MemberRefDto ref(@Nullable UUID id, @Nullable String name) {
			return (id != null && name != null) ? new MemberRefDto(id, name) : null;
		}

	}

	record CreatedActivityDto(UUID id, String type, MemberRefDto actor, Instant createdAt) implements ActivityDto {
	}

	record StatusChangedActivityDto(UUID id, String type, MemberRefDto actor, TicketStatus from, TicketStatus to,
			Instant createdAt) implements ActivityDto {
	}

	record PriorityChangedActivityDto(UUID id, String type, MemberRefDto actor, TicketPriority from, TicketPriority to,
			Instant createdAt) implements ActivityDto {
	}

	record AssigneeChangedActivityDto(UUID id, String type, MemberRefDto actor, @Nullable MemberRefDto from,
			@Nullable MemberRefDto to, Instant createdAt) implements ActivityDto {
	}

}
