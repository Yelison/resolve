package com.resolve.api.common.web;

import java.io.IOException;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Límite de 60 escrituras por minuto y por IP en la API de la demostración (plan §4.5-5). Fly.io no limita en el borde,
 * así que lo hace la aplicación; solo con {@code resolve.demo.limits=true}. Cuenta cada petición que no sea de lectura
 * antes de la cadena de seguridad (también una sin sesión o con el token CSRF equivocado: es el abuso que se acota) y
 * responde 429 Problem con {@code Retry-After} a partir de la 61.ª en la ventana deslizante de un minuto.
 *
 * <p>
 * <b>La IP del cliente no puede ser falsificable.</b> {@code X-Forwarded-For} lo escribe el cliente, y con
 * {@code forward-headers-strategy=framework} Spring hace que {@code getRemoteAddr()} devuelva su primer valor: por eso
 * se lee la dirección de la petición original, la del socket (la del proxy). Solo se confía en una cabecera que el proxy de la plataforma <i>sobrescribe</i>: el nombre va en
 * {@code resolve.demo.client-ip-header} ({@code Fly-Client-IP} en Fly) y, sin él o con un valor que no es una IP, se usa
 * la dirección de la conexión. Con el nombre puesto, el contenedor solo debe ser alcanzable a través del proxy (en Fly
 * lo es: el servicio no se publica en otro sitio); si no, cualquiera podría escribir esa cabecera.
 *
 * <p>
 * Los cubos viven en memoria, con un máximo de {@link #MAX_CLIENTS} IP (se descartan las menos recientes): con varias
 * máquinas cada una cuenta aparte. Es un límite anti abuso, no una cuota facturable.
 */
@Component
@ConditionalOnProperty(name = "resolve.demo.limits", havingValue = "true")
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
class WriteRateLimitFilter extends OncePerRequestFilter {

	static final int WRITES_PER_MINUTE = 60;

	static final Duration WINDOW = Duration.ofMinutes(1);

	static final int MAX_CLIENTS = 10_000;

	private static final Set<String> READS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

	private static final Pattern IP_LITERAL = Pattern.compile("[0-9a-fA-F:.]{2,45}");

	private final Clock clock;

	private final JsonMapper jsonMapper;

	private final @Nullable String clientIpHeader;

	private final Map<String, Deque<Long>> buckets = new LinkedHashMap<>(256, 0.75f, true) {

		@Override
		protected boolean removeEldestEntry(Map.Entry<String, Deque<Long>> eldest) {
			return size() > MAX_CLIENTS;
		}

	};

	WriteRateLimitFilter(Clock clock, JsonMapper jsonMapper,
			@Value("${resolve.demo.client-ip-header:}") String clientIpHeader) {
		this.clock = clock;
		this.jsonMapper = jsonMapper;
		this.clientIpHeader = clientIpHeader.isBlank() ? null : clientIpHeader.strip();
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return READS.contains(request.getMethod()) || !FilterProblems.isApi(request);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		long retryAfter = consume(clientIp(request));
		if (retryAfter == 0) {
			chain.doFilter(request, response);
			return;
		}
		response.setHeader("Retry-After", Long.toString(retryAfter));
		FilterProblems.write(this.jsonMapper, request, response, HttpStatus.TOO_MANY_REQUESTS,
				"Demasiadas escrituras",
				"La demostración admite " + WRITES_PER_MINUTE + " escrituras por minuto desde cada dirección. "
						+ "Espera un momento y vuelve a intentarlo.");
	}

	/** @return 0 si la petición cabe en la ventana; si no, los segundos hasta que cabría */
	private long consume(String client) {
		long now = this.clock.millis();
		synchronized (this.buckets) {
			Deque<Long> writes = this.buckets.computeIfAbsent(client, (key) -> new ArrayDeque<>());
			while (!writes.isEmpty() && now - writes.peekFirst() >= WINDOW.toMillis()) {
				writes.pollFirst();
			}
			if (writes.size() >= WRITES_PER_MINUTE) {
				long wait = WINDOW.toMillis() - (now - writes.peekFirst());
				return Math.max(1, (wait + 999) / 1000);
			}
			writes.addLast(now);
			return 0;
		}
	}

	private String clientIp(HttpServletRequest request) {
		if (this.clientIpHeader != null) {
			String value = request.getHeader(this.clientIpHeader);
			if (value != null && IP_LITERAL.matcher(value.strip()).matches()) {
				String key = bucketKey(value.strip());
				if (key != null) {
					return key;
				}
			}
		}
		String socket = connectionAddress(request);
		String key = bucketKey(socket);
		return (key != null) ? key : socket;
	}

	/**
	 * La clave del cubo, o {@code null} si no es una dirección. Una IPv6 se cuenta por su prefijo /64 (el tamaño que recibe
	 * un abonado o un VPS): si no, quien tiene un /64 enviaría cada escritura desde una dirección distinta y no llegaría
	 * nunca a 60 en ningún cubo, además de expulsar los cubos de otros clientes de la tabla acotada. Solo se interpreta lo
	 * que contiene «:», que nunca es un nombre de host: no hay consulta DNS.
	 */
	static @Nullable String bucketKey(String address) {
		if (address.indexOf(':') < 0) {
			return address;
		}
		try {
			if (InetAddress.getByName(address) instanceof Inet6Address ipv6) {
				byte[] bytes = ipv6.getAddress();
				return String.format("%02x%02x:%02x%02x:%02x%02x:%02x%02x::/64", bytes[0], bytes[1], bytes[2], bytes[3],
						bytes[4], bytes[5], bytes[6], bytes[7]);
			}
			return address;
		}
		catch (UnknownHostException invalid) {
			return null;
		}
	}

	/**
	 * La dirección del socket. Con {@code forward-headers-strategy=framework} (prod) {@code ForwardedHeaderFilter}
	 * envuelve la petición y hace que {@code getRemoteAddr()} devuelva el primer valor de {@code X-Forwarded-For} o
	 * {@code Forwarded: for=}, que escribe el cliente: hay que llegar a la petición original.
	 */
	private static String connectionAddress(HttpServletRequest request) {
		ServletRequest original = request;
		while (original instanceof ServletRequestWrapper wrapper) {
			original = wrapper.getRequest();
		}
		return original.getRemoteAddr();
	}

}
