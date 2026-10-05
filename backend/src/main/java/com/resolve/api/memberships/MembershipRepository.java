package com.resolve.api.memberships;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

	@Query("""
			select m from Membership m join fetch m.user u join fetch m.organization
			where lower(u.email) = lower(:email)
			order by m.id
			""")
	List<Membership> findAllByUserEmail(String email);

	@Query("""
			select m from Membership m join fetch m.user u
			where m.organization.id = :organizationId and m.role in (com.resolve.api.memberships.Role.ADMIN,
				com.resolve.api.memberships.Role.AGENT) and m.status = com.resolve.api.memberships.MemberStatus.ACTIVE
			order by lower(u.name), u.id
			""")
	List<Membership> findStaff(UUID organizationId);

	/** El equipo en cualquier estado, también los retirados: el cliente de la API decide si los muestra. */
	@Query("""
			select m from Membership m join fetch m.user u
			where m.organization.id = :organizationId and m.role in (com.resolve.api.memberships.Role.ADMIN,
				com.resolve.api.memberships.Role.AGENT)
			order by lower(u.name), u.id
			""")
	List<Membership> findTeam(UUID organizationId);

	/**
	 * Responsable válido de un ticket con {@code SELECT … FOR SHARE} sobre la membresía: una retirada no puede
	 * confirmarse entre la comprobación y el commit de la asignación, así que no queda un ticket abierto asignado a
	 * alguien retirado. Sin {@code join fetch}: el usuario se carga después, de forma perezosa.
	 */
	@Lock(LockModeType.PESSIMISTIC_READ)
	@Query("""
			select m from Membership m
			where m.organization.id = :organizationId and m.user.id = :userId and m.role in (
				com.resolve.api.memberships.Role.ADMIN, com.resolve.api.memberships.Role.AGENT)
				and m.status = com.resolve.api.memberships.MemberStatus.ACTIVE
			""")
	Optional<Membership> findAssignableStaffMemberShared(UUID organizationId, UUID userId);

	/** Miembro del equipo (admin o agente) en cualquier estado, con la fila bloqueada hasta el commit. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select m from Membership m
			where m.organization.id = :organizationId and m.user.id = :userId and m.role in (
				com.resolve.api.memberships.Role.ADMIN, com.resolve.api.memberships.Role.AGENT)
			""")
	Optional<Membership> lockTeamMember(UUID organizationId, UUID userId);

	/** Cualquier membresía del usuario en la organización, sea cual sea su rol o estado. */
	@Query("""
			select m from Membership m
			where m.organization.id = :organizationId and m.user.id = :userId
			""")
	Optional<Membership> findByOrganizationAndUser(UUID organizationId, UUID userId);

	/** Membresías que enlazan a un cliente, sea cual sea su estado. */
	@Query("""
			select m from Membership m
			where m.organization.id = :organizationId and m.customerId = :customerId
			""")
	List<Membership> findByCustomer(UUID organizationId, UUID customerId);

	@Query("""
			select count(m) from Membership m
			where m.organization.id = :organizationId and m.role = com.resolve.api.memberships.Role.ADMIN
				and m.status = com.resolve.api.memberships.MemberStatus.ACTIVE
			""")
	long countActiveAdmins(UUID organizationId);

	/**
	 * Activa una invitación. Es un {@code UPDATE} condicional y no un cambio de la entidad: si una retirada se
	 * confirmó entre la lectura y la activación no afecta a ninguna fila y el miembro retirado no resucita.
	 * @return las filas activadas: 1, o 0 si la membresía ya no estaba {@code invited}
	 */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update Membership m set m.status = com.resolve.api.memberships.MemberStatus.ACTIVE, m.joinedAt = :now
			where m.id = :id and m.status = com.resolve.api.memberships.MemberStatus.INVITED
			""")
	int activate(UUID id, Instant now);

	@Query("select m.status from Membership m where m.id = :id")
	Optional<MemberStatus> statusOf(UUID id);

	/** Estados vigentes (sin retirados) de las membresías que enlazan a un cliente, para su acceso al portal. */
	@Query("""
			select m.status from Membership m
			where m.organization.id = :organizationId and m.customerId = :customerId
				and m.status <> com.resolve.api.memberships.MemberStatus.REMOVED
			""")
	List<MemberStatus> liveStatusesOfCustomer(UUID organizationId, UUID customerId);

	default Optional<Membership> findFirstByUserEmail(String email) {
		return findAllByUserEmail(email).stream().findFirst();
	}

}
