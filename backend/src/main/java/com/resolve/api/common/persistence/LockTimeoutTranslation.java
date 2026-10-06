package com.resolve.api.common.persistence;

import java.sql.SQLException;

import javax.sql.DataSource;

import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.SQLErrorCodeSQLExceptionTranslator;

/**
 * Hace que el 55P03 (el tope de {@link LockTimeouts}) de una sentencia de {@code JdbcClient} llegue como
 * {@link CannotAcquireLockException}, igual que por la ruta JPA, y la API lo responda con un 503. Sin esto el tope
 * que fija {@code set local lock_timeout} alcanza sentencias nativas cuyo error sale como
 * {@code UncategorizedSQLException} (un 500). Solo ese estado: un interbloqueo (40P01) conserva la traducción de
 * Spring y sigue siendo un 500.
 */
@Configuration(proxyBeanMethods = false)
class LockTimeoutTranslation {

	static final String LOCK_NOT_AVAILABLE = "55P03";

	@Bean
	static BeanPostProcessor lockTimeoutTranslatorInstaller() {
		return new BeanPostProcessor() {
			@Override
			public Object postProcessAfterInitialization(Object bean, String beanName) {
				if (bean instanceof JdbcTemplate template && template.getDataSource() != null) {
					template.setExceptionTranslator(new Translator(template.getDataSource()));
				}
				return bean;
			}
		};
	}

	static final class Translator extends SQLErrorCodeSQLExceptionTranslator {

		Translator(DataSource dataSource) {
			super(dataSource);
		}

		@Override
		protected @Nullable DataAccessException customTranslate(String task, @Nullable String sql,
				SQLException exception) {
			if (LOCK_NOT_AVAILABLE.equals(exception.getSQLState())) {
				return new CannotAcquireLockException(buildMessage(task, sql, exception), exception);
			}
			return null;
		}

	}

}
