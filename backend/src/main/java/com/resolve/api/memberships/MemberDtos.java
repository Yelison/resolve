package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Representaciones de la API del equipo. {@link MemberDto} es la versión reducida de {@code /assignees}. */
public final class MemberDtos {

	private MemberDtos() {
	}

	/** Miembro con su estado y su carga ({@code TeamMember} en el contrato); {@code id} es el del usuario. */
	public record TeamMemberDto(UUID id, String name, String email, Role role, MemberStatus status, int openTickets,
			@Nullable Instant joinedAt, @Nullable Instant invitedAt) {

		static TeamMemberDto from(Membership membership, int openTickets) {
			UserAccount user = membership.getUser();
			return new TeamMemberDto(user.getId(), user.getName(), user.getEmail(), membership.getRole(),
					membership.getStatus(), openTickets, membership.getJoinedAt(), membership.getInvitedAt());
		}

	}

	/** Métricas del equipo de la organización ({@code TeamMetrics} en el contrato). */
	public record TeamMetricsDto(int staff, int assignedOpen, int unassignedOpen, double averageLoad,
			@Nullable Integer firstResponseMinutes, int firstResponseTargetMinutes) {
	}

}
