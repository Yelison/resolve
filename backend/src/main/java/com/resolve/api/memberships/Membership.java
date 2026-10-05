package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.organizations.Organization;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.jspecify.annotations.Nullable;

/** Pertenencia de un usuario a una organización con un rol. Los clientes enlazan su registro de cliente. */
@Entity
@Table(name = "memberships")
public class Membership {

	@Id
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "organization_id")
	private Organization organization;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id")
	private UserAccount user;

	@Column(nullable = false)
	private Role role;

	@Column(name = "customer_id")
	private @Nullable UUID customerId;

	@Column(nullable = false)
	private MemberStatus status;

	@Column(name = "invited_at")
	private @Nullable Instant invitedAt;

	@Column(name = "joined_at")
	private @Nullable Instant joinedAt;

	@Column(name = "removed_at")
	private @Nullable Instant removedAt;

	protected Membership() {
	}

	public UUID getId() {
		return this.id;
	}

	public Organization getOrganization() {
		return this.organization;
	}

	public UserAccount getUser() {
		return this.user;
	}

	public Role getRole() {
		return this.role;
	}

	public @Nullable UUID getCustomerId() {
		return this.customerId;
	}

	public MemberStatus getStatus() {
		return this.status;
	}

	public @Nullable Instant getInvitedAt() {
		return this.invitedAt;
	}

	public @Nullable Instant getJoinedAt() {
		return this.joinedAt;
	}

	public @Nullable Instant getRemovedAt() {
		return this.removedAt;
	}

}
