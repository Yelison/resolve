package com.resolve.api.memberships;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

	@Query("select u from UserAccount u where lower(u.email) = lower(:email)")
	Optional<UserAccount> findByEmailIgnoreCase(String email);

}
