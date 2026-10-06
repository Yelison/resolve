package com.resolve.api.common.security;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.resolve.api.common.web.ApiPathPrefix;
import com.resolve.api.common.web.Uuids;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * La organización que la pantalla dice mostrar, en la cabecera {@value #HEADER} de cada escritura, contra la de la
 * sesión: si no coinciden, 409 antes de que la petición llegue a ningún controlador, así que no hay efecto que deshacer.
 * Es la garantía que no puede dar el cliente (issue #60): otra pestaña pudo cambiar de organización entre que la pantalla
 * compuso la escritura y que esta llegó.
 *
 * <p>
 * Una sola comprobación en la cadena de seguridad, no una por controlador: una escritura nueva queda cubierta sin que
 * nadie se acuerde, y {@code ApiAccess} recorre todas las del contrato para demostrarlo. Va justo después de resolver el
 * principal y antes de la autorización por rol, de modo que un 401 sigue ganando (sin principal no se comprueba nada) y,
 * entre una organización que no es la de la sesión y un rol que no basta, la respuesta es la que explica que la pantalla
 * está desfasada. La compara con la organización del principal resuelto, que es la de la sesión, también en
 * {@code dev}/{@code test}, donde el principal sale de la cabecera de demostración.
 *
 * <p>
 * La cabecera es opcional: sin ella no se comprueba nada. Hacerla obligatoria obligaría a cada llamada del cliente a
 * pasarla y rompería a quien no muestra ninguna organización; a cambio, un cliente que no la envía no tiene esta garantía.
 * Solo las escrituras: las lecturas ya están limitadas a la organización de la sesión y no dejan nada que deshacer.
 * {@code POST /session/organization} la ignora porque es lo que elige la organización; {@code POST /logout} la gestiona
 * el filtro de cierre de sesión, que va antes.
 */
final class OrganizationHeaderFilter extends OncePerRequestFilter {

	static final String HEADER = "X-Organization-Id";

	private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

	private static final String SELECT_ORGANIZATION = ApiPathPrefix.of("/session/organization");

	private final ProblemResponses problems;

	OrganizationHeaderFilter(ProblemResponses problems) {
		this.problems = problems;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		boolean api = path.equals(ApiPathPrefix.PATH) || path.startsWith(ApiPathPrefix.PATH + "/");
		return !api || SAFE_METHODS.contains(request.getMethod()) || path.equals(SELECT_ORGANIZATION)
				|| request.getHeader(HEADER) == null;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (!(authentication != null && authentication.getPrincipal() instanceof CurrentMember member)) {
			// Sin principal decide la autorización (401), no esta comprobación.
			chain.doFilter(request, response);
			return;
		}
		Optional<UUID> shown = Uuids.parse(request.getHeader(HEADER));
		if (shown.isEmpty()) {
			this.problems.badOrganizationHeader(request, response, HEADER);
			return;
		}
		if (!shown.get().equals(member.organizationId())) {
			this.problems.organizationMismatch(request, response);
			return;
		}
		chain.doFilter(request, response);
	}

}
