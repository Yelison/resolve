package com.resolve.api.common.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicBoolean;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * El modo mantenimiento de la demostración: mientras dura, la API responde 503 ({@link MaintenanceFilter}) y la
 * disponibilidad de readiness es {@code OUT_OF_SERVICE} ({@link MaintenanceHealthIndicator}); la liveness no se toca.
 *
 * <p>
 * <b>La marca vive en la base de datos, en un esquema propio</b> ({@code resolve_ops.maintenance(until)}), no en
 * memoria ni en un endpoint: {@code flyway clean} solo borra los esquemas que gestiona (el de la aplicación), así que la
 * marca sobrevive al reinicio de datos que justifica el modo; vale para varias máquinas y para un reinicio de la
 * aplicación a mitad; y activarla exige credenciales de la base de datos de la demostración, no una ruta pública que
 * hubiera que proteger en la cadena de seguridad. El flujo de trabajo la escribe con {@code psql}
 * (docs/deploy/README.md).
 *
 * <p>
 * <b>Tope de tiempo.</b> La marca es una hora límite ({@code until}), no un interruptor: si el flujo falla a mitad,
 * el modo se acaba solo. Además se ignora una marca que caduque dentro de más de {@link #MAX_WINDOW}, para que un
 * valor erróneo (o malicioso, de quien ya tendría la base de datos) no deje la demostración cerrada indefinidamente.
 *
 * <p>
 * <b>Lectura perezosa.</b> No hay sondeo programado: la base de datos se lee cuando llega una petición a la API y la
 * última lectura tiene más de {@code resolve.demo.maintenance-poll} (5 s), una sola a la vez. Sin tráfico no hay
 * consultas, así que la base de datos (Neon) puede suspenderse; la primera petición tras una pausa ya lee la marca antes
 * de decidir. La readiness no consulta la base de datos por su cuenta: refleja la última lectura (las comprobaciones de
 * la plataforma, cada pocos segundos, mantendrían la base despierta). Entre lecturas la decisión se toma con el reloj de
 * la aplicación, con la diferencia con el de la base de datos medida en cada lectura. <b>Un fallo de lectura conserva la
 * marca anterior</b> (que caduca sola): una conexión cortada a mitad del {@code clean} no reabre la API sobre una base de
 * datos a medio migrar. Sin marca anterior, una tabla ausente o un fallo significan «sin mantenimiento».
 */
@Component
@ConditionalOnProperty(name = "resolve.demo.enabled", havingValue = "true")
public class MaintenanceMode {

	/** Lo máximo que una marca puede caducar por delante de la hora de la base de datos. */
	static final Duration MAX_WINDOW = Duration.ofMinutes(15);

	private static final Logger LOGGER = LoggerFactory.getLogger(MaintenanceMode.class);

	private static final String READ = "SELECT until, now() FROM resolve_ops.maintenance ORDER BY until DESC LIMIT 1";

	private final JdbcClient jdbc;

	private final Clock clock;

	private final long maxAgeMillis;

	private final AtomicBoolean reading = new AtomicBoolean();

	/** Hasta cuándo, medido con el reloj de la aplicación; {@code null} si no hay marca vigente. */
	private volatile @Nullable Instant until;

	/** Cuándo se leyó por última vez ({@link Long#MIN_VALUE} si nunca). */
	private volatile long lastReadMillis = Long.MIN_VALUE;

	private volatile boolean readFailing;

	MaintenanceMode(JdbcClient jdbc, Clock clock,
			@Value("${resolve.demo.maintenance-poll:PT5S}") Duration maxAge) {
		this.jdbc = jdbc;
		this.clock = clock;
		this.maxAgeMillis = maxAge.toMillis();
	}

	/** Si hay mantenimiento ahora, leyendo la marca si la última lectura es vieja. Lo llama el filtro, por petición. */
	public boolean active() {
		refreshIfStale();
		return activeNow();
	}

	/** Lo que dice la última lectura, sin tocar la base de datos. Lo usa la readiness. */
	public boolean activeNow() {
		Instant limit = this.until;
		return limit != null && this.clock.instant().isBefore(limit);
	}

	/** Lo que falta para que acabe, para {@code Retry-After}; nunca menos de un segundo. */
	Duration remaining() {
		Instant limit = this.until;
		if (limit == null) {
			return Duration.ofSeconds(1);
		}
		Duration left = Duration.between(this.clock.instant(), limit);
		Duration rounded = Duration.ofSeconds((left.toMillis() + 999) / 1000);
		return rounded.compareTo(Duration.ofSeconds(1)) < 0 ? Duration.ofSeconds(1) : rounded;
	}

	private void refreshIfStale() {
		long now = this.clock.millis();
		if (this.lastReadMillis != Long.MIN_VALUE && now - this.lastReadMillis < this.maxAgeMillis) {
			return;
		}
		// Una sola lectura a la vez: el resto de las peticiones sigue con el valor anterior.
		if (this.reading.compareAndSet(false, true)) {
			try {
				refresh();
			}
			finally {
				this.reading.set(false);
			}
		}
	}

	/** Lee la marca ahora, sin esperar a que la última lectura sea vieja. */
	public void refresh() {
		this.until = read();
		this.lastReadMillis = this.clock.millis();
	}

	private @Nullable Instant read() {
		try {
			Instant limit = this.jdbc.sql(READ)
				.query((rs, row) -> {
					Instant mark = rs.getObject(1, OffsetDateTime.class).toInstant();
					Instant databaseNow = rs.getObject(2, OffsetDateTime.class).toInstant();
					if (Duration.between(databaseNow, mark).compareTo(MAX_WINDOW) > 0) {
						LOGGER.warn("Ignoring a maintenance mark more than {} ahead", MAX_WINDOW);
						return null;
					}
					// Del reloj de la base de datos al de la aplicación.
					return this.clock.instant().plus(Duration.between(databaseNow, mark));
				})
				.optional()
				.orElse(null);
			this.readFailing = false;
			return limit;
		}
		catch (DataAccessException exception) {
			if (!this.readFailing) {
				this.readFailing = true;
				LOGGER.warn("Cannot read resolve_ops.maintenance; keeping the last mark: {}",
						exception.getMostSpecificCause().getMessage());
			}
			return this.until;
		}
	}

}
