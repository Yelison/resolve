package com.resolve.api.common.persistence;

import java.sql.SQLException;
import javax.sql.DataSource;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Una sentencia nativa que vence el tope es un {@code CannotAcquireLockException}; los demás estados se traducen
 * como lo hace un {@code JdbcTemplate} sin tocar.
 */
class LockTimeoutTranslationTest extends ApiIntegrationTest {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private DataSource dataSource;

	@Test
	void theTemplateTranslatesALockTimeout() {
		DataAccessException timeout = translate(this.jdbcTemplate, "55P03");

		assertThat(timeout).isInstanceOf(CannotAcquireLockException.class);
		assertThat(timeout.getCause()).hasFieldOrPropertyWithValue("SQLState", "55P03");
	}

	@Test
	void everyOtherStateKeepsTheTranslationOfAPlainTemplate() {
		JdbcTemplate plain = new JdbcTemplate(this.dataSource);

		for (String state : new String[] { "40P01", "40001", "21000", "23505" }) {
			assertThat(translate(this.jdbcTemplate, state)).as(state)
				.isNotNull()
				.hasSameClassAs(translate(plain, state));
		}
	}

	private static DataAccessException translate(JdbcTemplate template, String sqlState) {
		return template.getExceptionTranslator()
			.translate("task", "select 1", new SQLException("error " + sqlState, sqlState));
	}

}
