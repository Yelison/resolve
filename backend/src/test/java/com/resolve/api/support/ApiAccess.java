package com.resolve.api.support;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.resolve.api.support.OpenApiContract.Operation;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.method.HandlerMethod;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Quién puede llamar a cada operación del contrato, escrito a mano y por operación: los tests que la usan comparan
 * esta tabla con {@link OpenApiContract#operationIds()}, así que una operación nueva sin fila (o una fila de una
 * operación que ya no existe) los hace fallar. Es la red de seguridad del prefijo {@code /api}: las reglas de
 * autorización viven en rutas con prefijo y una que dejara de coincidir dejaría una operación abierta o cerrada sin
 * que ningún otro test lo notara.
 *
 * <p>
 * El anónimo no puede llamar a ninguna salvo a {@code logout}, que es idempotente y existe solo con el perfil
 * {@code oidc}.
 */
public final class ApiAccess {

	public enum Role {

		ADMIN, AGENT, CUSTOMER

	}

	private static final Set<Role> ANYONE = Set.of(Role.ADMIN, Role.AGENT, Role.CUSTOMER);

	private static final Set<Role> STAFF = Set.of(Role.ADMIN, Role.AGENT);

	private static final Set<Role> ADMIN = Set.of(Role.ADMIN);

	/** Operación que solo existe con el perfil {@code oidc}. */
	public static final String LOGOUT = "logout";

	private static final Map<String, Set<Role>> ALLOWED = Map.ofEntries(
			// Sesión y perfil: cualquier persona autenticada.
			Map.entry("getMe", ANYONE), Map.entry("updateMe", ANYONE), Map.entry("listSessionOrganizations", ANYONE),
			Map.entry("selectSessionOrganization", ANYONE), Map.entry(LOGOUT, ANYONE),
			// Organización.
			Map.entry("getOrganization", STAFF), Map.entry("updateOrganization", ADMIN),
			// Tickets: los clientes leen los suyos; el resto es del personal.
			Map.entry("listTickets", ANYONE), Map.entry("getTicket", ANYONE), Map.entry("listMessages", ANYONE),
			Map.entry("createTicket", STAFF), Map.entry("getTicketMetrics", STAFF),
			Map.entry("listRecentActivity", STAFF), Map.entry("updateTicket", STAFF), Map.entry("createMessage", STAFF),
			Map.entry("listActivity", STAFF),
			// Clientes: del personal; archivar, restaurar e invitar solo de administradores.
			Map.entry("listCustomers", STAFF), Map.entry("createCustomer", STAFF),
			Map.entry("getCustomerMetrics", STAFF), Map.entry("listCompanies", STAFF), Map.entry("getCustomer", STAFF),
			Map.entry("updateCustomer", STAFF), Map.entry("archiveCustomer", ADMIN),
			Map.entry("restoreCustomer", ADMIN), Map.entry("inviteCustomer", ADMIN),
			// Equipo e informes.
			Map.entry("listMembers", STAFF), Map.entry("getTeamMetrics", STAFF), Map.entry("listAssignees", STAFF),
			Map.entry("inviteMember", ADMIN), Map.entry("changeMemberRole", ADMIN), Map.entry("removeMember", ADMIN),
			Map.entry("getReportSummary", STAFF),
			// Base de conocimiento: los clientes leen; el personal escribe; las categorías, solo administradores.
			Map.entry("listCategories", ANYONE), Map.entry("listArticles", ANYONE), Map.entry("getArticle", ANYONE),
			Map.entry("createCategory", ADMIN), Map.entry("createArticle", STAFF), Map.entry("updateArticle", STAFF),
			Map.entry("publishArticle", STAFF), Map.entry("unpublishArticle", STAFF));

	private ApiAccess() {
	}

	/** Operación → roles autorizados. */
	public static Map<String, Set<Role>> allowed() {
		return ALLOWED;
	}

	/**
	 * Petición a la operación tal como la publica el contrato: {@code servers[0].url} más la ruta, con valores
	 * cualesquiera en los parámetros de ruta (un número, un uuid y un slug que no existen) y un cuerpo JSON vacío en
	 * las que lo llevan. Lo que responda el controlador a eso (400, 404, 428…) no importa: el test solo mira si la
	 * petición llegó a él.
	 */
	public static MockHttpServletRequestBuilder request(Operation operation) {
		String path = OpenApiContract.serverUrl() + operation.path()
			.replace("{number}", "1")
			.replace("{id}", UUID.randomUUID().toString())
			.replace("{userId}", UUID.randomUUID().toString())
			.replace("{slug}", "no-existe");
		return MockMvcRequestBuilders.request(HttpMethod.valueOf(operation.method()), path)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}");
	}

	/**
	 * Recorre cada operación del contrato (salvo {@link #LOGOUT}) con cada rol y como anónimo, y devuelve lo que no
	 * cumple la tabla:
	 * <ul>
	 * <li>un rol sin permiso recibe 403 y un anónimo 401, ambos como Problem Details, sin redirección y sin que la
	 * petición llegue a un controlador;
	 * <li>un rol con permiso llega a un controlador (el handler es un {@link HandlerMethod}) y no recibe 401 ni 403.
	 * </ul>
	 * Que llegue al controlador es lo que prueba que el prefijo y las reglas de seguridad coinciden: sin eso, un 404 de
	 * «no existe esa ruta» pasaría por «permitido».
	 */
	public static List<String> violations(MockMvc mvc, Map<Role, RequestPostProcessor> credentials,
			RequestPostProcessor anonymous) throws Exception {
		List<String> violations = new ArrayList<>();
		for (Operation operation : OpenApiContract.operations()) {
			if (LOGOUT.equals(operation.operationId())) {
				continue;
			}
			String name = operation.operationId() + " " + operation.method() + " " + operation.path();
			Map<String, RequestPostProcessor> callers = new LinkedHashMap<>();
			callers.put("anónimo", anonymous);
			credentials.forEach((role, credential) -> callers.put(role.name(), credential));
			for (Map.Entry<String, RequestPostProcessor> caller : callers.entrySet()) {
				MvcResult result = mvc.perform(request(operation).with(caller.getValue())).andReturn();
				int status = result.getResponse().getStatus();
				Role role = caller.getKey().equals("anónimo") ? null : Role.valueOf(caller.getKey());
				String who = name + " como " + caller.getKey();
				if (role != null && ALLOWED.get(operation.operationId()).contains(role)) {
					if (status == 401 || status == 403) {
						violations.add(who + ": debía llegar al controlador y recibió " + status);
					}
					else if (!(result.getHandler() instanceof HandlerMethod)) {
						violations.add(who + ": respondió " + status + " sin pasar por ningún controlador");
					}
					continue;
				}
				int expected = (role == null) ? 401 : 403;
				if (status != expected) {
					violations.add(who + ": debía ser " + expected + " y fue " + status);
				}
				else if (result.getHandler() != null) {
					violations.add(who + ": la seguridad debía cortarla antes del controlador");
				}
				else if (!MediaType.APPLICATION_PROBLEM_JSON.isCompatibleWith(
						MediaType.parseMediaType(result.getResponse().getContentType()))) {
					violations.add(who + ": " + status + " sin Problem Details ("
							+ result.getResponse().getContentType() + ")");
				}
				else if (result.getResponse().getHeader("Location") != null) {
					violations.add(who + ": no puede redirigir");
				}
			}
		}
		return violations;
	}

}
