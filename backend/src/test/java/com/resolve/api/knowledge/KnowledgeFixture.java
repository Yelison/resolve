package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Dos organizaciones. Acme: una administradora, una agente, una clienta con acceso al portal, tres categorías y cinco
 * artículos que mezclan estado y visibilidad (los clientes solo pueden ver dos). Northwind: un agente y una categoría
 * con el mismo slug que la de Acme, para probar el aislamiento en cada operación.
 */
abstract class KnowledgeFixture extends ApiIntegrationTest {

	static final String ADMIN = "admin@acme.example";

	static final String LAURA = "laura@acme.example";

	static final String MARIA = "maria@cliente.example";

	static final String NORTHWIND_AGENT = "agente@northwind.example";

	static final JsonMapper JSON = JsonMapper.builder().build();

	/** Publicado y público: lo ven los clientes. */
	static final String RECOVER = "como-recuperar-el-acceso-a-tu-cuenta";

	/** Borrador público: todavía no lo ven los clientes. */
	static final String CHANGE_PLAN = "cambiar-el-plan";

	/** Publicado pero interno: nunca lo ven los clientes. */
	static final String REFUNDS = "guia-de-reembolsos";

	/** Borrador interno. */
	static final String ESCALATION = "notas-de-escalado";

	/** Publicado y público. */
	static final String INVOICES = "descargar-facturas";

	UUID acme;

	UUID lauraId;

	UUID accountCategory;

	UUID billingCategory;

	UUID internalCategory;

	UUID northwind;

	UUID northwindCategory;

	@BeforeEach
	void seedKnowledge() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.lauraId = this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		UUID mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.data.customerUser(this.acme, mariaCustomer, "María Pérez", MARIA);
		this.accountCategory = this.data.category(this.acme, "Cuenta y acceso", "cuenta-y-acceso");
		this.billingCategory = this.data.category(this.acme, "Facturación", "facturacion");
		this.internalCategory = this.data.category(this.acme, "Procesos internos", "procesos-internos");
		article(RECOVER, "Cómo recuperar el acceso a tu cuenta", "Pulsa «Restablecer contraseña» y sigue los pasos.",
				this.accountCategory, "published", "public", "2026-10-01T10:00:00Z");
		article(CHANGE_PLAN, "Cambiar el plan", "Desde Ajustes elige el plan que prefieras.", this.billingCategory,
				"draft", "public", "2026-10-02T10:00:00Z");
		article(REFUNDS, "Guía de reembolsos", "Un reembolso interno requiere la aprobación de un administrador.",
				this.billingCategory, "published", "internal", "2026-10-03T10:00:00Z");
		article(ESCALATION, "Notas de escalado", "Escala a nivel dos tras cuatro horas sin respuesta.",
				this.internalCategory, "draft", "internal", "2026-10-03T12:00:00Z");
		article(INVOICES, "Descargar facturas", "Las facturas están en Facturación, en la pestaña Historial.",
				this.billingCategory, "published", "public", "2026-10-03T13:00:00Z");
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.data.staff(this.northwind, "agent", "Jordi Puig", NORTHWIND_AGENT);
		this.northwindCategory = this.data.category(this.northwind, "Cuenta y acceso", "cuenta-y-acceso");
	}

	private void article(String slug, String title, String body, UUID category, String status, String visibility,
			String updatedAt) {
		this.data.article(this.acme, category, slug, title, body, status, visibility, this.lauraId,
				Instant.parse(updatedAt));
	}

	/** Cuerpo de un alta con los cuatro campos obligatorios. */
	static String articleJson(String title, String body, UUID categoryId, String visibility) {
		return JSON.createObjectNode()
			.put("title", title)
			.put("body", body)
			.put("categoryId", categoryId.toString())
			.put("visibility", visibility)
			.toString();
	}

	MvcResult postArticle(String user, String json) throws Exception {
		return this.mvc
			.perform(post("/knowledge/articles").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(json))
			.andReturn();
	}

	/** Crea un artículo en la categoría de cuenta de Acme y devuelve el cuerpo de la respuesta. */
	JsonNode createArticle(String user, String title) throws Exception {
		return body(postArticle(user, articleJson(title, "Texto de «" + title + "»", this.accountCategory, "internal")));
	}

	MvcResult getArticle(String user, String slug) throws Exception {
		return this.mvc.perform(get("/knowledge/articles/" + slug).with(as(user))).andReturn();
	}

	MvcResult patchArticle(String user, String slug, String version, String json) throws Exception {
		return this.mvc
			.perform(patch("/knowledge/articles/" + slug).with(as(user))
				.header("If-Match", "\"" + version + "\"")
				.contentType("application/merge-patch+json")
				.content(json))
			.andReturn();
	}

	MvcResult publish(String user, String slug) throws Exception {
		return this.mvc.perform(post("/knowledge/articles/" + slug + "/publish").with(as(user))).andReturn();
	}

	MvcResult unpublish(String user, String slug) throws Exception {
		return this.mvc.perform(post("/knowledge/articles/" + slug + "/unpublish").with(as(user))).andReturn();
	}

	JsonNode listArticles(String user, String query) throws Exception {
		return body(this.mvc.perform(get("/knowledge/articles" + query).with(as(user))).andReturn());
	}

	JsonNode listCategories(String user) throws Exception {
		return body(this.mvc.perform(get("/knowledge/categories").with(as(user))).andReturn());
	}

	/** Slugs de una página de la lista, en el orden recibido. */
	static List<String> slugs(JsonNode page) {
		List<String> slugs = new ArrayList<>();
		page.path("items").forEach((item) -> slugs.add(item.path("slug").asString()));
		return slugs;
	}

	static JsonNode body(MvcResult result) throws Exception {
		return JSON.readTree(result.getResponse().getContentAsString());
	}

}
