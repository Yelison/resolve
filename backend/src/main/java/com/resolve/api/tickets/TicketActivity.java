package com.resolve.api.tickets;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.AssignedIdEntity;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.memberships.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.jspecify.annotations.Nullable;

/**
 * Entrada del historial. Guarda el actor y los valores anterior y nuevo; los nombres se copian en el momento del
 * cambio para que el historial no varíe si después se renombra a alguien.
 */
@Entity
@Table(name = "ticket_activities")
public class TicketActivity extends AssignedIdEntity {

	@Column(name = "organization_id", nullable = false, updatable = false)
	private UUID organizationId;

	@Column(name = "ticket_id", nullable = false, updatable = false)
	private UUID ticketId;

	@Column(nullable = false, updatable = false)
	private ActivityType type;

	@Column(name = "actor_user_id", nullable = false, updatable = false)
	private UUID actorUserId;

	@Column(name = "actor_name", nullable = false, updatable = false)
	private String actorName;

	@Column(name = "from_value", updatable = false)
	private @Nullable String fromValue;

	@Column(name = "to_value", updatable = false)
	private @Nullable String toValue;

	@Column(name = "from_assignee_id", updatable = false)
	private @Nullable UUID fromAssigneeId;

	@Column(name = "from_assignee_name", updatable = false)
	private @Nullable String fromAssigneeName;

	@Column(name = "to_assignee_id", updatable = false)
	private @Nullable UUID toAssigneeId;

	@Column(name = "to_assignee_name", updatable = false)
	private @Nullable String toAssigneeName;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected TicketActivity() {
	}

	private TicketActivity(UUID id, Ticket ticket, ActivityType type, CurrentMember actor, Instant now) {
		super(id);
		this.organizationId = ticket.getOrganizationId();
		this.ticketId = ticket.getId();
		this.type = type;
		this.actorUserId = actor.userId();
		this.actorName = actor.name();
		this.createdAt = now;
	}

	static TicketActivity created(UUID id, Ticket ticket, CurrentMember actor, Instant now) {
		return new TicketActivity(id, ticket, ActivityType.CREATED, actor, now);
	}

	static TicketActivity statusChanged(UUID id, Ticket ticket, CurrentMember actor, TicketStatus from, TicketStatus to,
			Instant now) {
		TicketActivity activity = new TicketActivity(id, ticket, ActivityType.STATUS_CHANGED, actor, now);
		activity.fromValue = from.wireValue();
		activity.toValue = to.wireValue();
		return activity;
	}

	static TicketActivity priorityChanged(UUID id, Ticket ticket, CurrentMember actor, TicketPriority from,
			TicketPriority to, Instant now) {
		TicketActivity activity = new TicketActivity(id, ticket, ActivityType.PRIORITY_CHANGED, actor, now);
		activity.fromValue = from.wireValue();
		activity.toValue = to.wireValue();
		return activity;
	}

	static TicketActivity assigneeChanged(UUID id, Ticket ticket, CurrentMember actor, @Nullable UserAccount from,
			@Nullable UserAccount to, Instant now) {
		TicketActivity activity = new TicketActivity(id, ticket, ActivityType.ASSIGNEE_CHANGED, actor, now);
		if (from != null) {
			activity.fromAssigneeId = from.getId();
			activity.fromAssigneeName = from.getName();
		}
		if (to != null) {
			activity.toAssigneeId = to.getId();
			activity.toAssigneeName = to.getName();
		}
		return activity;
	}

	public ActivityType getType() {
		return this.type;
	}

	public UUID getActorUserId() {
		return this.actorUserId;
	}

	public String getActorName() {
		return this.actorName;
	}

	public @Nullable String getFromValue() {
		return this.fromValue;
	}

	public @Nullable String getToValue() {
		return this.toValue;
	}

	public @Nullable UUID getFromAssigneeId() {
		return this.fromAssigneeId;
	}

	public @Nullable String getFromAssigneeName() {
		return this.fromAssigneeName;
	}

	public @Nullable UUID getToAssigneeId() {
		return this.toAssigneeId;
	}

	public @Nullable String getToAssigneeName() {
		return this.toAssigneeName;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

}
