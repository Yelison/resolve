package com.resolve.api.memberships;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
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
				com.resolve.api.memberships.Role.AGENT)
			order by lower(u.name), u.id
			""")
	List<Membership> findStaff(UUID organizationId);

	@Query("""
			select m from Membership m join fetch m.user u
			where m.organization.id = :organizationId and u.id = :userId and m.role in (com.resolve.api.memberships.Role.ADMIN,
				com.resolve.api.memberships.Role.AGENT)
			""")
	Optional<Membership> findStaffMember(UUID organizationId, UUID userId);

	default Optional<Membership> findFirstByUserEmail(String email) {
		return findAllByUserEmail(email).stream().findFirst();
	}

}
