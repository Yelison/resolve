package com.resolve.api.common.persistence;

import java.sql.SQLException;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Una sentencia nativa que vence el tope es un {@code CannotAcquireLockException}; un interbloqueo, no. */
class LockTimeoutTranslationTest extends ApiIntegrationTest {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void theTemplateTranslatesALockTimeoutAndNotADeadlock() {
		DataAccessException timeout = this.jdbcTemplate.getExceptionTranslator()
			.translate("task", "select 1", new SQLException("canceling statement due to lock timeout", "55P03"));
		DataAccessException deadlock = this.jdbcTemplate.getExceptionTranslator()
			.translate("task", "select 1", new SQLException("deadlock detected", "40P01"));

		assertThat(timeout).isInstanceOf(CannotAcquireLockException.class);
		assertThat(timeout.getCause()).hasFieldOrPropertyWithValue("SQLState", "55P03");
		assertThat(deadlock).isNotInstanceOf(CannotAcquireLockException.class);
	}

}
