package com.resolve.api.common.persistence;

import java.sql.SQLException;

import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.SQLExceptionTranslator;

/**
 * Hace que el 55P03 (el tope de {@link LockTimeouts}) de una sentencia de {@code JdbcClient} llegue como
 * {@link CannotAcquireLockException}, igual que por la ruta JPA, y la API lo responda con un 503. Sin esto el tope
 * que fija {@code set local lock_timeout} alcanza sentencias nativas cuyo error sale como
 * {@code UncategorizedSQLException} (un 500). Solo ese estado: el traductor que el {@code JdbcTemplate} ya tenía se
 * conserva y atiende cualquier otro, así que un interbloqueo (40P01) y el resto siguen siendo lo que eran (y un 500).
 */
@Configuration(proxyBeanMethods = false)
class LockTimeoutTranslation {

	static final String LOCK_NOT_AVAILABLE = "55P03";

	@Bean
	static BeanPostProcessor lockTimeoutTranslatorInstaller() {
		return new BeanPostProcessor() {
			@Override
			public Object postProcessAfterInitialization(Object bean, String beanName) {
				if (bean instanceof JdbcTemplate template) {
					template.setExceptionTranslator(new Translator(template.getExceptionTranslator()));
				}
				return bean;
			}
		};
	}

	record Translator(SQLExceptionTranslator standard) implements SQLExceptionTranslator {

		@Override
		public @Nullable DataAccessException translate(String task, @Nullable String sql, SQLException exception) {
			if (LOCK_NOT_AVAILABLE.equals(exception.getSQLState())) {
				return new CannotAcquireLockException(
						task + "; " + ((sql != null) ? "SQL [" + sql + "]; " : "") + exception.getMessage(), exception);
			}
			return this.standard.translate(task, sql, exception);
		}

	}

}
