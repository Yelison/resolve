package com.resolve.api.tickets;

import java.time.Instant;
import java.util.Objects;
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
import jakarta.persistence.Version;
import org.hibernate.annotations.DynamicUpdate;
import org.jspecify.annotations.Nullable;

/**
 * {@link DynamicUpdate}: el UPDATE solo incluye las columnas modificadas. Sin él, un PATCH concurrente con una
 * respuesta pública (que escribe first_response_at y updated_at sin cambiar la versión) las sobrescribiría con el
 * valor que leyó antes.
 */
@Entity
@Table(name = "tickets")
@DynamicUpdate
public class Ticket extends AssignedIdEntity {

	@Column(name = "organization_id", nullable = false, updatable = false)
	private UUID organizationId;

	@Column(nullable = false, updatable = false)
	private long number;

	@Column(nullable = false)
	private String subject;

	@Column(nullable = false)
	private String description;

	@Column(nullable = false)
	private TicketStatus status;

	@Column(nullable = false)
	private TicketPriority priority;

	@Column(nullable = false, updatable = false)
	private TicketChannel channel;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "customer_id", updatable = false)
	private Customer customer;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "assignee_id")
	private @Nullable UserAccount assignee;

	@Column(name = "first_response_at")
	private @Nullable Instant firstResponseAt;

	@Version
	@Column(nullable = false)
	private long version;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Ticket() {
	}

	Ticket(UUID id, UUID organizationId, long number, String subject, String description, TicketPriority priority,
			TicketChannel channel, Customer customer, @Nullable UserAccount assignee, Instant now) {
		super(id);
		this.organizationId = organizationId;
		this.number = number;
		this.subject = subject;
		this.description = description;
		this.status = TicketStatus.OPEN;
		this.priority = priority;
		this.channel = channel;
		this.customer = customer;
		this.assignee = assignee;
		this.createdAt = now;
		this.updatedAt = now;
	}

	/** @return el estado anterior si cambió */
	@Nullable TicketStatus changeStatus(TicketStatus newStatus, Instant now) {
		if (this.status == newStatus) {
			return null;
		}
		TicketStatus previous = this.status;
		this.status = newStatus;
		this.updatedAt = latest(now);
		return previous;
	}

	/** @return la prioridad anterior si cambió */
	@Nullable TicketPriority changePriority(TicketPriority newPriority, Instant now) {
		if (this.priority == newPriority) {
			return null;
		}
		TicketPriority previous = this.priority;
		this.priority = newPriority;
		this.updatedAt = latest(now);
		return previous;
	}

	/** @return {@code true} si cambió el responsable */
	boolean assign(@Nullable UserAccount newAssignee, Instant now) {
		UUID current = (this.assignee != null) ? this.assignee.getId() : null;
		UUID next = (newAssignee != null) ? newAssignee.getId() : null;
		if (Objects.equals(current, next)) {
			return false;
		}
		this.assignee = newAssignee;
		this.updatedAt = latest(now);
		return true;
	}

	/** Nunca retrocede: una respuesta pública confirmada con un reloj posterior no se pierde. */
	private Instant latest(Instant now) {
		return now.isAfter(this.updatedAt) ? now : this.updatedAt;
	}

	public UUID getOrganizationId() {
		return this.organizationId;
	}

	public long getNumber() {
		return this.number;
	}

	public String getSubject() {
		return this.subject;
	}

	public String getDescription() {
		return this.description;
	}

	public TicketStatus getStatus() {
		return this.status;
	}

	public TicketPriority getPriority() {
		return this.priority;
	}

	public TicketChannel getChannel() {
		return this.channel;
	}

	public Customer getCustomer() {
		return this.customer;
	}

	public @Nullable UserAccount getAssignee() {
		return this.assignee;
	}

	public long getVersion() {
		return this.version;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public Instant getUpdatedAt() {
		return this.updatedAt;
	}

}
