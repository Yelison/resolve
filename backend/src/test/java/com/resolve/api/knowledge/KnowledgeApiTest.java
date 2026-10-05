package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Categorías, alta, lectura, búsqueda, edición y publicación de artículos por el personal. */
class KnowledgeApiTest extends KnowledgeFixture {

	private static final Instant LATER = Instant.parse("2026-10-05T09:30:00Z");

	// --- Categorías --------------------------------------------------------------------------------------------

	@Test
	void listsTheCategoriesByNameWithTheirArticleCounts() throws Exception {
		this.mvc.perform(get("/knowledge/categories").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCategories"))
			.andExpect(jsonPath("$[0].name").value("Cuenta y acceso"))
			.andExpect(jsonPath("$[0].articles").value(1))
			.andExpect(jsonPath("$[1].name").value("Facturación"))
			.andExpect(jsonPath("$[1].articles").value(3))
			.andExpect(jsonPath("$[2].name").value("Procesos internos"))
			.andExpect(jsonPath("$[2].description").isEmpty());
	}

	@Test
	void anAdminCreatesACategoryWithASlugFromItsName() throws Exception {
		this.mvc.perform(post("/knowledge/categories").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"  Envíos y devoluciones \", \"description\": \" Todo sobre pedidos \"}"))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createCategory"))
			.andExpect(jsonPath("$.name").value("Envíos y devoluciones"))
			.andExpect(jsonPath("$.slug").value("envios-y-devoluciones"))
			.andExpect(jsonPath("$.description").value("Todo sobre pedidos"))
			.andExpect(jsonPath("$.articles").value(0));

		// La nueva categoría aparece para el personal de su organización y no para la otra.
		assertThat(categorySlugs(listCategories(LAURA))).contains("envios-y-devoluciones");
		assertThat(categorySlugs(listCategories(NORTHWIND_AGENT))).doesNotContain("envios-y-devoluciones");
	}

	@Test
	void rejectsACategoryWhoseSlugAlreadyExistsWithAFieldError() throws Exception {
		// «Facturacion» sin tilde y en mayúsculas produce el mismo slug que «Facturación».
		MvcResult result = postCategory(ADMIN, "{\"name\": \"FACTURACION\"}");

		assertThat(result.getResponse().getStatus()).isEqualTo(400);
		assertThat(errors(result)).containsEntry("name", "Ya existe una categoría con un nombre equivalente.");
	}

	@Test
	void validatesTheCategoryFields() throws Exception {
		assertThat(errors(postCategory(ADMIN, "{}"))).containsEntry("name", "Es obligatorio.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"   \"}"))).containsEntry("name", "Es obligatorio.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": 7}"))).containsEntry("name", "Debe ser un texto.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": null}"))).containsEntry("name", "No admite null.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"" + "a".repeat(81) + "\"}"))).containsEntry("name",
				"Admite como máximo 80 caracteres.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"Con\\u0000nulo\"}"))).containsEntry("name",
				"No admite caracteres de control.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"Ok\", \"description\": \"" + "d".repeat(161) + "\"}")))
			.containsEntry("description", "Admite como máximo 160 caracteres.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"Ok\", \"description\": 3}")))
			.containsEntry("description", "Debe ser un texto o null.");
		assertThat(errors(postCategory(ADMIN, "{\"name\": \"Ok\", \"organizationId\": \"" + this.northwind + "\"}")))
			.containsEntry("organizationId", "Campo no permitido.");
		assertThat(errors(postCategory(ADMIN, "[]"))).containsKey("body");
	}

	@Test
	@Timeout(30)
	void simultaneousCategoriesWithTheSameNameYieldOne201AndTheRestFieldErrors() throws Exception {
		List<Callable<Integer>> requests = new ArrayList<>();
		for (int i = 0; i < 8; i++) {
			requests.add(() -> postCategory(ADMIN, "{\"name\": \"Envíos\"}").getResponse().getStatus());
		}

		List<Integer> statuses = inParallel(requests);

		// Nunca un 500: quien pierde la carrera recibe el mismo 400 que un duplicado detectado antes.
		assertThat(statuses).containsOnly(201, 400);
		assertThat(statuses.stream().filter((status) -> status == 201).count()).isEqualTo(1);
		assertThat(categorySlugs(listCategories(ADMIN)).stream().filter("envios"::equals).count()).isEqualTo(1);
	}

	// --- Alta de artículos -------------------------------------------------------------------------------------

	@Test
	void createsADraftAndReturnsLocationAndEtag() throws Exception {
		this.mvc.perform(post("/knowledge/articles").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content(articleJson("  Cómo cambiar la contraseña ", "## Pasos\n\n1. Entra en **Ajustes**.\n",
					this.accountCategory, "public")))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createArticle"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(header().string("Location",
					"http://localhost/knowledge/articles/como-cambiar-la-contrasena"))
			.andExpect(jsonPath("$.title").value("Cómo cambiar la contraseña"))
			.andExpect(jsonPath("$.slug").value("como-cambiar-la-contrasena"))
			.andExpect(jsonPath("$.body").value("## Pasos\n\n1. Entra en **Ajustes**.\n"))
			.andExpect(jsonPath("$.status").value("draft"))
			.andExpect(jsonPath("$.visibility").value("public"))
			.andExpect(jsonPath("$.allowFeedback").value(true))
			.andExpect(jsonPath("$.version").value(0))
			.andExpect(jsonPath("$.publishedAt").isEmpty())
			.andExpect(jsonPath("$.updatedAt").value(TestClockConfiguration.START.toString()))
			.andExpect(jsonPath("$.category.id").value(this.accountCategory.toString()))
			.andExpect(jsonPath("$.category.slug").value("cuenta-y-acceso"))
			.andExpect(jsonPath("$.createdBy.id").value(this.lauraId.toString()))
			.andExpect(jsonPath("$.createdBy.name").value("Laura Méndez"))
			.andExpect(jsonPath("$.updatedBy.name").value("Laura Méndez"));
	}

	@Test
	void theNewArticleCanBeReadAndListedByItsAuthorsOrganization() throws Exception {
		JsonNode created = createArticle(LAURA, "Primeros pasos");

		MvcResult read = getArticle(ADMIN, created.path("slug").asString());
		assertThat(read.getResponse().getStatus()).isEqualTo(200);
		assertThat(read.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
		assertThat(slugs(listArticles(ADMIN, "?q=primeros"))).containsExactly("primeros-pasos");
		assertThat(listArticles(NORTHWIND_AGENT, "?q=primeros").path("totalItems").asInt()).isZero();
	}

	@Test
	void honoursAllowFeedbackAndStoresTheBodyAsReceived() throws Exception {
		// D-06: el backend no renderiza ni sanea el Markdown; lo guarda y lo devuelve tal cual.
		String hostile = "<script>alert(1)</script>\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>\n\ttabulado";
		JsonNode request = JSON.readTree(articleJson("Contenido hostil", hostile, this.accountCategory, "internal"));
		((ObjectNode) request).put("allowFeedback", false);

		MvcResult result = postArticle(LAURA, request.toString());

		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(result).path("allowFeedback").asBoolean()).isFalse();
		assertThat(body(getArticle(LAURA, "contenido-hostil")).path("body").asString()).isEqualTo(hostile);
	}

	@Test
	void slugsAreAsciiUniqueAndStable() throws Exception {
		assertThat(createArticle(LAURA, "Cómo recuperar el acceso").path("slug").asString())
			.isEqualTo("como-recuperar-el-acceso");
		assertThat(createArticle(LAURA, "Cómo recuperar el acceso").path("slug").asString())
			.isEqualTo("como-recuperar-el-acceso-2");
		assertThat(createArticle(ADMIN, "COMO RECUPERAR EL ACCESO!").path("slug").asString())
			.isEqualTo("como-recuperar-el-acceso-3");
		// Un título que ya parece un slug con sufijo ocupa ese sufijo: el siguiente salta al libre.
		assertThat(createArticle(LAURA, "Factura").path("slug").asString()).isEqualTo("factura");
		assertThat(createArticle(LAURA, "Factura 2").path("slug").asString()).isEqualTo("factura-2");
		assertThat(createArticle(LAURA, "Factura").path("slug").asString()).isEqualTo("factura-3");
		// Un título sin letras ni números usa el slug de reserva.
		assertThat(createArticle(LAURA, "¿?").path("slug").asString()).isEqualTo("articulo");
		assertThat(createArticle(LAURA, "😀").path("slug").asString()).isEqualTo("articulo-2");
		// Cambiar el título no cambia el slug, y el slug sigue sirviendo para leerlo.
		MvcResult edited = patchArticle(LAURA, "como-recuperar-el-acceso-2", "0", "{\"title\": \"Otro título\"}");
		assertThat(body(edited).path("slug").asString()).isEqualTo("como-recuperar-el-acceso-2");
		assertThat(body(getArticle(LAURA, "como-recuperar-el-acceso-2")).path("title").asString())
			.isEqualTo("Otro título");
		// Una slug larga se recorta a 100 y no deja guion al final.
		JsonNode longTitle = createArticle(LAURA, "a".repeat(99) + " b");
		assertThat(longTitle.path("slug").asString()).isEqualTo("a".repeat(99));
	}

	@Test
	void theSegmentsOfTheInterfaceAreNeverASlug() throws Exception {
		// /conocimiento/nuevo abre el editor: un artículo con ese slug no se podría abrir desde la interfaz.
		assertThat(createArticle(LAURA, "Nuevo").path("slug").asString()).isEqualTo("nuevo-2");
		assertThat(createArticle(LAURA, "¡NUEVO!").path("slug").asString()).isEqualTo("nuevo-3");
		assertThat(createArticle(LAURA, "Editar").path("slug").asString()).isEqualTo("editar-2");
		// Un título que ya contiene otra cosa no se ve afectado.
		assertThat(createArticle(LAURA, "Nuevo plan").path("slug").asString()).isEqualTo("nuevo-plan");
	}

	@Test
	void creatingUsesTheCategoryOfTheOrganizationOnly() throws Exception {
		MvcResult foreign = postArticle(LAURA, articleJson("Ajeno", "Texto", this.northwindCategory, "internal"));
		MvcResult unknown = postArticle(LAURA, articleJson("Ajeno", "Texto", UUID.randomUUID(), "internal"));

		assertThat(foreign.getResponse().getStatus()).isEqualTo(400);
		assertThat(errors(foreign)).containsEntry("categoryId", "No existe la categoría.");
		// Una categoría ajena responde igual que una inexistente.
		assertThat(errors(unknown)).isEqualTo(errors(foreign));
		this.mvc.perform(post("/knowledge/articles").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content(articleJson("Ajeno", "Texto", this.northwindCategory, "internal")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createArticle"));
		assertThat(listArticles(LAURA, "?q=ajeno").path("totalItems").asInt()).isZero();
	}

	@Test
	void validatesTheArticleFields() throws Exception {
		JsonNode valid = JSON.readTree(articleJson("Título", "Texto", this.accountCategory, "public"));
		assertThat(errors(postArticle(LAURA, "{}"))).containsEntry("title", "Es obligatorio.")
			.containsEntry("body", "Es obligatorio.")
			.containsEntry("categoryId", "Es obligatorio.")
			.containsEntry("visibility", "Es obligatorio.");
		assertThat(errors(postArticle(LAURA, with(valid, "title", "7")))).containsOnlyKeys("title")
			.containsEntry("title", "Debe ser un texto.");
		assertThat(errors(postArticle(LAURA, with(valid, "title", "null")))).containsEntry("title", "No admite null.");
		assertThat(errors(postArticle(LAURA, with(valid, "title", "\"   \"")))).containsEntry("title",
				"Es obligatorio.");
		assertThat(errors(postArticle(LAURA, with(valid, "title", "\"" + "t".repeat(161) + "\""))))
			.containsEntry("title", "Admite como máximo 160 caracteres.");
		assertThat(errors(postArticle(LAURA, with(valid, "title", "\"Con\\nsalto\""))))
			.containsEntry("title", "No admite caracteres de control.");
		assertThat(errors(postArticle(LAURA, with(valid, "body", "true")))).containsEntry("body", "Debe ser un texto.");
		assertThat(errors(postArticle(LAURA, with(valid, "body", "\"  \\n \"")))).containsEntry("body",
				"Es obligatorio.");
		assertThat(errors(postArticle(LAURA, with(valid, "body", "\"Con\\u0000nulo\"")))).containsEntry("body",
				"No admite caracteres de control.");
		assertThat(errors(postArticle(LAURA, with(valid, "visibility", "\"private\"")))).containsEntry("visibility",
				"Debe ser internal o public.");
		assertThat(errors(postArticle(LAURA, with(valid, "visibility", "1")))).containsEntry("visibility",
				"Debe ser un texto.");
		assertThat(errors(postArticle(LAURA, with(valid, "categoryId", "\"no-es-un-uuid\""))))
			.containsEntry("categoryId", "Debe ser un identificador de categoría válido.");
		assertThat(errors(postArticle(LAURA, with(valid, "categoryId", "\"1-2-3-4-5\""))))
			.containsEntry("categoryId", "Debe ser un identificador de categoría válido.");
		assertThat(errors(postArticle(LAURA, with(valid, "categoryId", "5")))).containsEntry("categoryId",
				"Debe ser un texto.");
		assertThat(errors(postArticle(LAURA, with(valid, "allowFeedback", "\"si\"")))).containsEntry("allowFeedback",
				"Debe ser verdadero o falso.");
		assertThat(errors(postArticle(LAURA, with(valid, "status", "\"published\"")))).containsEntry("status",
				"Campo no permitido.");
		assertThat(errors(postArticle(LAURA, with(valid, "organizationId", "\"" + this.northwind + "\""))))
			.containsEntry("organizationId", "Campo no permitido.");
		assertThat(errors(postArticle(LAURA, "[]"))).containsKey("body");
		this.mvc.perform(post("/knowledge/articles").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createArticle"));
		assertThat(listArticles(LAURA, "").path("totalItems").asInt()).isEqualTo(5);
	}

	@Test
	void theBodyAdmitsTwentyThousandCharactersAndNoMore() throws Exception {
		String limit = "x".repeat(20_000);

		MvcResult accepted = postArticle(LAURA, articleJson("Largo", limit, this.accountCategory, "internal"));
		MvcResult rejected = postArticle(LAURA, articleJson("Demasiado largo", limit + "x", this.accountCategory,
				"internal"));

		assertThat(accepted.getResponse().getStatus()).isEqualTo(201);
		assertThat(rejected.getResponse().getStatus()).isEqualTo(400);
		assertThat(errors(rejected)).containsEntry("body", "Admite como máximo 20 000 caracteres.");
		// Los caracteres fuera del plano básico cuentan una vez, no dos.
		String emojis = "😀".repeat(20_000);
		assertThat(postArticle(LAURA, articleJson("Emojis", emojis, this.accountCategory, "internal")).getResponse()
			.getStatus()).isEqualTo(201);
	}

	// --- Lectura y lista ---------------------------------------------------------------------------------------

	@Test
	void staffReadADraftWithItsVersion() throws Exception {
		this.mvc.perform(get("/knowledge/articles/" + ESCALATION).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getArticle"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.status").value("draft"))
			.andExpect(jsonPath("$.visibility").value("internal"))
			.andExpect(jsonPath("$.category.name").value("Procesos internos"))
			.andExpect(jsonPath("$.body").value("Escala a nivel dos tras cuatro horas sin respuesta."));
		this.mvc.perform(get("/knowledge/articles/no-existe").with(as(LAURA)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("getArticle"));
	}

	@Test
	void listsByLastUpdateNewestFirstWithoutTheBody() throws Exception {
		this.mvc.perform(get("/knowledge/articles").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listArticles"))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.totalPages").value(1))
			.andExpect(jsonPath("$.items[0].slug").value(INVOICES))
			.andExpect(jsonPath("$.items[0].body").doesNotExist())
			.andExpect(jsonPath("$.items[0].category.slug").value("facturacion"))
			.andExpect(jsonPath("$.items[0].publishedAt").value("2026-10-03T13:00:00Z"))
			.andExpect(jsonPath("$.items[4].slug").value(RECOVER));
		assertThat(slugs(listArticles(LAURA, ""))).containsExactly(INVOICES, ESCALATION, REFUNDS, CHANGE_PLAN, RECOVER);
		assertThat(slugs(listArticles(LAURA, "?sort=updatedAt,asc"))).containsExactly(RECOVER, CHANGE_PLAN, REFUNDS,
				ESCALATION, INVOICES);
	}

	@Test
	void sortsByTitleIgnoringCaseAndPaginates() throws Exception {
		assertThat(slugs(listArticles(LAURA, "?sort=title,asc"))).containsExactly(CHANGE_PLAN, RECOVER, INVOICES,
				REFUNDS, ESCALATION);
		assertThat(slugs(listArticles(LAURA, "?sort=title,desc"))).containsExactly(ESCALATION, REFUNDS, INVOICES,
				RECOVER, CHANGE_PLAN);
		JsonNode second = listArticles(LAURA, "?size=2&page=1");
		assertThat(slugs(second)).containsExactly(REFUNDS, CHANGE_PLAN);
		assertThat(second.path("page").asInt()).isEqualTo(1);
		assertThat(second.path("size").asInt()).isEqualTo(2);
		assertThat(second.path("totalPages").asInt()).isEqualTo(3);
		JsonNode past = listArticles(LAURA, "?size=2&page=3");
		assertThat(slugs(past)).isEmpty();
		assertThat(past.path("totalItems").asInt()).isEqualTo(5);
	}

	@Test
	void articlesUpdatedAtTheSameInstantKeepAStableOrderByIdInTheDirectionOfTheSort() throws Exception {
		Instant same = Instant.parse("2026-10-05T00:00:00Z");
		this.data.article(this.acme, this.accountCategory, "a-primero", "A primero", "Texto", "draft", "internal",
				this.lauraId, same);
		this.data.article(this.acme, this.accountCategory, "b-segundo", "B segundo", "Texto", "draft", "internal",
				this.lauraId, same);
		// Dos ids UUIDv7 creados en el mismo milisegundo no quedan en orden de creación: el orden esperado sale de los
		// ids reales. El texto en minúsculas de un uuid se ordena igual que el tipo uuid de PostgreSQL.
		String firstId = body(getArticle(LAURA, "a-primero")).path("id").asString();
		String secondId = body(getArticle(LAURA, "b-segundo")).path("id").asString();
		List<String> byIdAscending = (firstId.compareTo(secondId) < 0) ? List.of("a-primero", "b-segundo")
				: List.of("b-segundo", "a-primero");
		List<String> byIdDescending = List.of(byIdAscending.get(1), byIdAscending.get(0));

		// Descendente: los dos empatados abren la lista, con el id mayor primero.
		assertThat(slugs(listArticles(LAURA, "?size=2"))).containsExactlyElementsOf(byIdDescending);
		// Ascendente: los cinco sembrados van primero y los dos empatados cierran la lista, con el id menor primero.
		assertThat(slugs(listArticles(LAURA, "?sort=updatedAt,asc&size=1&page=5")))
			.containsExactly(byIdAscending.get(0));
		assertThat(slugs(listArticles(LAURA, "?sort=updatedAt,asc&size=1&page=6")))
			.containsExactly(byIdAscending.get(1));
	}

	@Test
	void filtersByCategorySlugAndStatus() throws Exception {
		assertThat(slugs(listArticles(LAURA, "?category=facturacion"))).containsExactly(INVOICES, REFUNDS, CHANGE_PLAN);
		assertThat(slugs(listArticles(LAURA, "?category=facturacion&status=draft"))).containsExactly(CHANGE_PLAN);
		assertThat(slugs(listArticles(LAURA, "?status=published"))).containsExactly(INVOICES, REFUNDS, RECOVER);
		assertThat(slugs(listArticles(LAURA, "?status=draft"))).containsExactly(ESCALATION, CHANGE_PLAN);
		assertThat(listArticles(LAURA, "?category=no-existe").path("totalItems").asInt()).isZero();
		// El slug de una categoría ajena, con el mismo texto, no deja ver artículos de la otra organización.
		assertThat(listArticles(NORTHWIND_AGENT, "?category=cuenta-y-acceso").path("totalItems").asInt()).isZero();
	}

	@Test
	void searchMatchesTitleBodyAndCategory() throws Exception {
		// Título.
		assertThat(slugs(listArticles(LAURA, "?q=cambiar"))).containsExactly(CHANGE_PLAN);
		// Cuerpo, sin distinguir mayúsculas.
		assertThat(slugs(listArticles(LAURA, "?q=RESTABLECER"))).containsExactly(RECOVER);
		// Nombre de la categoría: todos los de «Facturación», aunque el texto no esté en su título.
		assertThat(slugs(listArticles(LAURA, "?q=Procesos"))).containsExactly(ESCALATION);
		assertThat(slugs(listArticles(LAURA, "?q=facturación"))).containsExactly(INVOICES, REFUNDS, CHANGE_PLAN);
		// Combinada con un filtro por AND.
		assertThat(slugs(listArticles(LAURA, "?q=facturación&status=draft"))).containsExactly(CHANGE_PLAN);
		assertThat(listArticles(LAURA, "?q=nada-que-coincida").path("totalItems").asInt()).isZero();
	}

	@Test
	void searchTreatsWildcardsAsPlainText() throws Exception {
		this.data.article(this.acme, this.accountCategory, "cobertura", "Cobertura", "Garantía del 100% asegurada",
				"draft", "internal", this.lauraId, Instant.parse("2026-10-05T00:00:00Z"));
		this.data.article(this.acme, this.accountCategory, "camel", "Camel", "usa snake_case siempre", "draft",
				"internal", this.lauraId, Instant.parse("2026-10-05T01:00:00Z"));

		assertThat(searchSlugs("%")).containsExactly("cobertura");
		assertThat(searchSlugs("_")).containsExactly("camel");
		assertThat(searchSlugs("100%")).containsExactly("cobertura");
		assertThat(searchSlugs("\\")).isEmpty();
	}

	@Test
	void searchAndCategoryLimitsCountCharactersNotUtf16Units() throws Exception {
		// 61 emojis son 61 caracteres (122 unidades UTF-16): caben en el máximo de 120.
		String sixtyOne = "😀".repeat(61);
		for (String parameter : List.of("q", "category")) {
			assertThat(this.mvc.perform(get("/knowledge/articles").param(parameter, sixtyOne).with(as(LAURA)))
				.andReturn()
				.getResponse()
				.getStatus()).as(parameter + " con 61 emojis").isEqualTo(200);
			assertThat(this.mvc.perform(get("/knowledge/articles").param(parameter, "😀".repeat(120)).with(as(LAURA)))
				.andReturn()
				.getResponse()
				.getStatus()).as(parameter + " con 120 emojis").isEqualTo(200);
			assertThat(this.mvc.perform(get("/knowledge/articles").param(parameter, "😀".repeat(121)).with(as(LAURA)))
				.andReturn()
				.getResponse()
				.getStatus()).as(parameter + " con 121 caracteres").isEqualTo(400);
		}
	}

	@Test
	void rejectsInvalidListParametersWithFieldErrors() throws Exception {
		for (String query : List.of("?page=-1", "?size=0", "?size=101", "?sort=slug,asc", "?sort=title",
				"?status=archived", "?q=" + "x".repeat(121), "?category=" + "x".repeat(121))) {
			this.mvc.perform(get("/knowledge/articles" + query).with(as(LAURA)))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("listArticles"));
		}
		assertThat(errors(this.mvc.perform(get("/knowledge/articles?status=archived&sort=x,y&size=0").with(as(LAURA)))
			.andReturn())).containsOnlyKeys("status", "sort", "size");
	}

	// --- Edición -----------------------------------------------------------------------------------------------

	@Test
	void patchRequiresIfMatchAndBumpsVersion() throws Exception {
		// Sin If-Match: 428; con uno mal formado: 400; con una versión vieja: 412.
		this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content("{\"title\": \"Nuevo\"}"))
			.andExpect(status().isPreconditionRequired())
			.andExpect(matchesContract("updateArticle"));
		this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(LAURA))
			.header("If-Match", "W/\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"title\": \"Nuevo\"}"))
			.andExpect(status().isBadRequest());
		this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(LAURA))
			.header("If-Match", "\"7\"")
			.contentType("application/merge-patch+json")
			.content("{\"title\": \"Nuevo\"}"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(matchesContract("updateArticle"));
		assertThat(body(getArticle(LAURA, RECOVER)).path("title").asString())
			.isEqualTo("Cómo recuperar el acceso a tu cuenta");

		this.clock.set(LATER);
		this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(ADMIN))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"title\": \"Nuevo título\", \"body\": \"Nuevo cuerpo\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateArticle"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.version").value(1))
			.andExpect(jsonPath("$.title").value("Nuevo título"))
			.andExpect(jsonPath("$.body").value("Nuevo cuerpo"))
			.andExpect(jsonPath("$.slug").value(RECOVER))
			.andExpect(jsonPath("$.status").value("published"))
			.andExpect(jsonPath("$.updatedAt").value(LATER.toString()))
			.andExpect(jsonPath("$.updatedBy.name").value("Yelisson Ortiz"))
			.andExpect(jsonPath("$.createdBy.name").value("Laura Méndez"));
		// La versión vieja ya no vale.
		assertThat(patchArticle(LAURA, RECOVER, "0", "{\"title\": \"Otro\"}").getResponse().getStatus())
			.isEqualTo(412);
		assertThat(getArticle(LAURA, RECOVER).getResponse().getHeader("ETag")).isEqualTo("\"1\"");
	}

	@Test
	void patchChecksErrorsInTheDocumentedOrder() throws Exception {
		String invalid = "{\"title\": 7}";
		// 404 antes que 428: un slug inexistente sin If-Match es un 404.
		assertThat(this.mvc.perform(patch("/knowledge/articles/no-existe").with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content(invalid)).andReturn().getResponse().getStatus()).isEqualTo(404);
		// 428 antes que 400: sin If-Match y con un cuerpo inválido.
		assertThat(this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content(invalid)).andReturn().getResponse().getStatus()).isEqualTo(428);
		// 400 antes que 412: versión vieja y cuerpo inválido.
		assertThat(patchArticle(LAURA, RECOVER, "9", invalid).getResponse().getStatus()).isEqualTo(400);
		assertThat(patchArticle(LAURA, RECOVER, "9", "{\"title\": \"Ok\"}").getResponse().getStatus()).isEqualTo(412);
	}

	@Test
	void patchChangesCategoryVisibilityAndFeedbackAndKeepsThePublication() throws Exception {
		this.clock.set(LATER);
		MvcResult result = patchArticle(LAURA, RECOVER, "0", "{\"categoryId\": \"" + this.billingCategory
				+ "\", \"visibility\": \"internal\", \"allowFeedback\": false}");

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		JsonNode article = body(result);
		assertThat(article.path("category").path("slug").asString()).isEqualTo("facturacion");
		assertThat(article.path("visibility").asString()).isEqualTo("internal");
		assertThat(article.path("allowFeedback").asBoolean()).isFalse();
		assertThat(article.path("status").asString()).isEqualTo("published");
		assertThat(article.path("publishedAt").asString()).isEqualTo("2026-10-01T10:00:00Z");
		assertThat(count(listCategories(LAURA), "cuenta-y-acceso")).isZero();
		assertThat(count(listCategories(LAURA), "facturacion")).isEqualTo(4);
	}

	@Test
	void anEmptyPatchKeepsTheVersionTheEditorAndTheDate() throws Exception {
		this.clock.set(LATER);
		MvcResult result = patchArticle(ADMIN, RECOVER, "0",
				"{\"title\": \"Cómo recuperar el acceso a tu cuenta\", \"allowFeedback\": true, \"visibility\": \"public\"}");

		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		assertThat(result.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
		JsonNode article = body(result);
		assertThat(article.path("version").asInt()).isZero();
		assertThat(article.path("updatedAt").asString()).isEqualTo("2026-10-01T10:00:00Z");
		assertThat(article.path("updatedBy").path("name").asString()).isEqualTo("Laura Méndez");
	}

	@Test
	void patchValidatesLikeTheCreationAndRejectsWhatCannotChange() throws Exception {
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{}"))).containsKey("body");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "[]"))).containsKey("body");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"title\": null}"))).containsEntry("title",
				"No admite null.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"body\": \"\"}"))).containsEntry("body",
				"Es obligatorio.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"title\": \"" + "t".repeat(161) + "\"}")))
			.containsEntry("title", "Admite como máximo 160 caracteres.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"body\": \"" + "x".repeat(20_001) + "\"}")))
			.containsEntry("body", "Admite como máximo 20 000 caracteres.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"status\": \"draft\"}"))).containsEntry("status",
				"Campo no permitido.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"slug\": \"otro\"}"))).containsEntry("slug",
				"Campo no permitido.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"visibility\": \"private\"}")))
			.containsEntry("visibility", "Debe ser internal o public.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"categoryId\": \"" + this.northwindCategory + "\"}")))
			.containsEntry("categoryId", "No existe la categoría.");
		assertThat(errors(patchArticle(LAURA, RECOVER, "0", "{\"categoryId\": \"nope\"}")))
			.containsEntry("categoryId", "Debe ser un identificador de categoría válido.");
		this.mvc.perform(patch("/knowledge/articles/" + RECOVER).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"title\": 7}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateArticle"));
		assertThat(body(getArticle(LAURA, RECOVER)).path("version").asInt()).isZero();
	}

	@Test
	@Timeout(30)
	void twoConcurrentPatchesWithTheSameVersionYieldOne200AndOne412() throws Exception {
		List<Integer> statuses = inParallel(List.of(
				() -> patchArticle(LAURA, RECOVER, "0", "{\"title\": \"Una\"}").getResponse().getStatus(),
				() -> patchArticle(ADMIN, RECOVER, "0", "{\"title\": \"Otra\"}").getResponse().getStatus()));

		assertThat(statuses).containsExactlyInAnyOrder(200, 412);
		assertThat(body(getArticle(LAURA, RECOVER)).path("version").asInt()).isEqualTo(1);
	}

	// --- Publicar y despublicar --------------------------------------------------------------------------------

	@Test
	void publishingTwiceIsAConflict() throws Exception {
		this.clock.set(LATER);
		this.mvc.perform(post("/knowledge/articles/" + CHANGE_PLAN + "/publish").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("publishArticle"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.status").value("published"))
			.andExpect(jsonPath("$.publishedAt").value(LATER.toString()))
			.andExpect(jsonPath("$.updatedAt").value(LATER.toString()))
			.andExpect(jsonPath("$.updatedBy.name").value("Yelisson Ortiz"))
			.andExpect(jsonPath("$.version").value(1));

		this.mvc.perform(post("/knowledge/articles/" + CHANGE_PLAN + "/publish").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("publishArticle"));
		this.mvc.perform(post("/knowledge/articles/" + RECOVER + "/publish").with(as(LAURA)))
			.andExpect(status().isConflict());
		assertThat(body(getArticle(LAURA, CHANGE_PLAN)).path("version").asInt()).isEqualTo(1);
	}

	@Test
	void unpublishingADraftOrTwiceIsAConflictAndClearsThePublicationDate() throws Exception {
		this.mvc.perform(post("/knowledge/articles/" + CHANGE_PLAN + "/unpublish").with(as(LAURA)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("unpublishArticle"));

		this.clock.set(LATER);
		this.mvc.perform(post("/knowledge/articles/" + RECOVER + "/unpublish").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.status").value("draft"))
			.andExpect(jsonPath("$.publishedAt").isEmpty())
			.andExpect(jsonPath("$.updatedAt").value(LATER.toString()))
			.andExpect(jsonPath("$.updatedBy.name").value("Yelisson Ortiz"));
		this.mvc.perform(post("/knowledge/articles/" + RECOVER + "/unpublish").with(as(ADMIN)))
			.andExpect(status().isConflict());

		// Publicarlo de nuevo fija una fecha nueva y la versión sigue creciendo.
		this.clock.set(LATER.plusSeconds(3600));
		JsonNode again = body(publish(LAURA, RECOVER));
		assertThat(again.path("publishedAt").asString()).isEqualTo(LATER.plusSeconds(3600).toString());
		assertThat(again.path("version").asInt()).isEqualTo(2);
	}

	@Test
	void publishAndUnpublishOfAnUnknownSlugAreNotFound() throws Exception {
		this.mvc.perform(post("/knowledge/articles/no-existe/publish").with(as(LAURA)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("publishArticle"));
		this.mvc.perform(post("/knowledge/articles/no-existe/unpublish").with(as(LAURA)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("unpublishArticle"));
	}

	@Test
	@Timeout(30)
	void twoSimultaneousPublicationsYieldOne200AndOne409() throws Exception {
		List<Integer> statuses = inParallel(List.of(() -> publish(LAURA, CHANGE_PLAN).getResponse().getStatus(),
				() -> publish(ADMIN, CHANGE_PLAN).getResponse().getStatus()));

		// La fila bloqueada serializa las dos: la segunda lee el estado ya publicado y responde 409, no 412 ni 500.
		assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		assertThat(body(getArticle(LAURA, CHANGE_PLAN)).path("version").asInt()).isEqualTo(1);
	}

	// --- Ayudas ------------------------------------------------------------------------------------------------

	/** Slugs que devuelve la búsqueda del personal con un texto en crudo, sin codificar a mano. */
	private List<String> searchSlugs(String text) throws Exception {
		return slugs(body(this.mvc.perform(get("/knowledge/articles").param("q", text).with(as(LAURA))).andReturn()));
	}

	private MvcResult postCategory(String user, String json) throws Exception {
		return this.mvc
			.perform(post("/knowledge/categories").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(json))
			.andReturn();
	}

	/** Campo → mensaje de los errores de un 400; el test falla si la respuesta no lo es. */
	private static Map<String, String> errors(MvcResult result) throws Exception {
		assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(400);
		Map<String, String> errors = new HashMap<>();
		body(result).path("errors").forEach((error) -> errors.put(error.path("field").asString(),
				error.path("message").asString()));
		return errors;
	}

	/** El cuerpo de un alta válido con un campo cambiado por un valor JSON en crudo. */
	private static String with(JsonNode valid, String field, String rawJson) throws Exception {
		ObjectNode copy = (ObjectNode) valid.deepCopy();
		copy.set(field, JSON.readTree(rawJson));
		return copy.toString();
	}

	private static int count(JsonNode categories, String slug) {
		for (JsonNode category : categories) {
			if (slug.equals(category.path("slug").asString())) {
				return category.path("articles").asInt();
			}
		}
		throw new AssertionError("La categoría " + slug + " no está en la respuesta: " + categories);
	}

	private static List<String> categorySlugs(JsonNode categories) {
		List<String> slugs = new ArrayList<>();
		categories.forEach((category) -> slugs.add(category.path("slug").asString()));
		return slugs;
	}

	/** Lanza las peticiones a la vez desde la misma salida y devuelve sus estados. */
	private static List<Integer> inParallel(List<Callable<Integer>> requests) throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(requests.size());
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> futures = requests.stream().map((request) -> executor.submit(() -> {
				start.await();
				return request.call();
			})).toList();
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> future : futures) {
				statuses.add(future.get(20, TimeUnit.SECONDS));
			}
			return statuses;
		}
		finally {
			executor.shutdownNow();
		}
	}

}
