package com.resolve.api.tickets;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.AssignedIdEntity;
import com.resolve.api.customers.Customer;
import com.resolve.api.memberships.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.jspecify.annotations.Nullable;

/** Mensaje de la conversación: respuesta pública o nota interna. No forma parte de la versión del ticket. */
@Entity
@Table(name = "ticket_messages")
public class TicketMessage extends AssignedIdEntity {

	@Column(name = "organization_id", nullable = false, updatable = false)
	private UUID organizationId;

	@Column(name = "ticket_id", nullable = false, updatable = false)
	private UUID ticketId;

	@Column(nullable = false, updatable = false)
	private MessageVisibility visibility;

	@Column(name = "author_kind", nullable = false, updatable = false)
	private AuthorKind authorKind;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "author_user_id", updatable = false)
	private @Nullable UserAccount authorUser;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "author_customer_id", updatable = false)
	private @Nullable Customer authorCustomer;

	@Column(nullable = false, updatable = false)
	private String body;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected TicketMessage() {
	}

	static TicketMessage byAgent(UUID id, Ticket ticket, UserAccount author, MessageVisibility visibility, String body,
			Instant now) {
		TicketMessage message = new TicketMessage(id, ticket, visibility, AuthorKind.AGENT, body, now);
		message.authorUser = author;
		return message;
	}

	private TicketMessage(UUID id, Ticket ticket, MessageVisibility visibility, AuthorKind authorKind, String body,
			Instant now) {
		super(id);
		this.organizationId = ticket.getOrganizationId();
		this.ticketId = ticket.getId();
		this.visibility = visibility;
		this.authorKind = authorKind;
		this.body = body;
		this.createdAt = now;
	}

	public MessageVisibility getVisibility() {
		return this.visibility;
	}

	public AuthorKind getAuthorKind() {
		return this.authorKind;
	}

	public @Nullable UserAccount getAuthorUser() {
		return this.authorUser;
	}

	public @Nullable Customer getAuthorCustomer() {
		return this.authorCustomer;
	}

	public String getBody() {
		return this.body;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

}
