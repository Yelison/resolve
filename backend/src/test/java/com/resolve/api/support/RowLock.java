package com.resolve.api.support;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * Una segunda conexión que retiene una fila hasta {@link #close()}, para probar de forma determinista qué hace la
 * API cuando otra transacción tiene el bloqueo. Cerrarla siempre (try-with-resources): el {@code TRUNCATE} que
 * limpia la base entre tests esperaría a una transacción abierta.
 */
public final class RowLock implements AutoCloseable {

	private final Connection connection;

	private RowLock(Connection connection) {
		this.connection = connection;
	}

	/** Ejecuta la consulta {@code SELECT … FOR NO KEY UPDATE} sin confirmar la transacción. */
	public static RowLock hold(DataSource dataSource, String selectForUpdate, Object... parameters) throws SQLException {
		Connection connection = dataSource.getConnection();
		try {
			connection.setAutoCommit(false);
			try (PreparedStatement statement = connection.prepareStatement(selectForUpdate)) {
				for (int index = 0; index < parameters.length; index++) {
					statement.setObject(index + 1, parameters[index]);
				}
				if (!statement.execute()) {
					throw new IllegalStateException("La consulta no devolvió filas que bloquear");
				}
				if (!statement.getResultSet().next()) {
					throw new IllegalStateException("No existe la fila que debía bloquearse");
				}
			}
		}
		catch (SQLException | RuntimeException exception) {
			connection.close();
			throw exception;
		}
		return new RowLock(connection);
	}

	@Override
	public void close() throws SQLException {
		try {
			this.connection.rollback();
		}
		finally {
			this.connection.close();
		}
	}

}
