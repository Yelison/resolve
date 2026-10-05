package com.resolve.api.knowledge;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Qué ve y qué puede hacer cada rol en la base de conocimiento, y el aislamiento entre organizaciones. */
class KnowledgeAccessApiTest extends KnowledgeFixture {

	@Test
	void customersOnlySeePublishedPublicArticles() throws Exception {
		// Lista: solo los dos publicados y públicos, del más reciente al más antiguo.
		JsonNode page = listArticles(MARIA, "");
		assertThat(slugs(page)).containsExactly(INVOICES, RECOVER);
		assertThat(page.path("totalItems").asInt()).isEqualTo(2);
		// Detalle: el borrador público, el interno publicado y el borrador interno responden 404, como un slug ajeno.
		for (String hidden : List.of(CHANGE_PLAN, REFUNDS, ESCALATION, "no-existe")) {
			this.mvc.perform(get(API + "/knowledge/articles/" + hidden).with(as(MARIA)))
				.andExpect(status().isNotFound())
				.andExpect(matchesContract("getArticle"));
		}
		this.mvc.perform(get(API + "/knowledge/articles/" + RECOVER).with(as(MARIA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getArticle"))
			.andExpect(jsonPath("$.slug").value(RECOVER));
		// Categorías: el recuento es lo visible para el llamante.
		JsonNode customerView = listCategories(MARIA);
		assertThat(count(customerView, "cuenta-y-acceso")).isEqualTo(1);
		assertThat(count(customerView, "facturacion")).isEqualTo(1);
		JsonNode staffView = listCategories(LAURA);
		assertThat(count(staffView, "cuenta-y-acceso")).isEqualTo(1);
		assertThat(count(staffView, "facturacion")).isEqualTo(3);
		assertThat(count(staffView, "procesos-internos")).isEqualTo(1);
	}

	@Test
	void aCategoryWithoutVisibleArticlesIsLeftOutForCustomers() throws Exception {
		JsonNode customerView = listCategories(MARIA);

		assertThat(categorySlugs(customerView)).containsExactly("cuenta-y-acceso", "facturacion");
		assertThat(categorySlugs(listCategories(LAURA))).containsExactly("cuenta-y-acceso", "facturacion",
				"procesos-internos");
	}

	@Test
	void aCustomerCannotWidenTheListWithFiltersOrSearch() throws Exception {
		// Pedir borradores cruza el filtro forzado: página vacía, no la lista de borradores.
		assertThat(listArticles(MARIA, "?status=draft").path("totalItems").asInt()).isZero();
		// Un texto que solo aparece en un artículo interno, en su borrador o en una categoría interna no devuelve nada.
		assertThat(listArticles(MARIA, "?q=reembolso").path("totalItems").asInt()).isZero();
		assertThat(listArticles(MARIA, "?q=escala").path("totalItems").asInt()).isZero();
		assertThat(listArticles(MARIA, "?q=Procesos").path("totalItems").asInt()).isZero();
		assertThat(listArticles(MARIA, "?category=procesos-internos").path("totalItems").asInt()).isZero();
		assertThat(slugs(listArticles(MARIA, "?category=facturacion"))).containsExactly(INVOICES);
		// Pedir publicados no amplía nada: sigue sin ver el interno.
		assertThat(slugs(listArticles(MARIA, "?status=published"))).containsExactly(INVOICES, RECOVER);
		// El personal sí ve todo.
		assertThat(listArticles(LAURA, "").path("totalItems").asInt()).isEqualTo(5);
	}

	@Test
	void unpublishingHidesFromCustomers() throws Exception {
		this.mvc.perform(post(API + "/knowledge/articles/" + RECOVER + "/unpublish").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("unpublishArticle"));

		this.mvc.perform(get(API + "/knowledge/articles/" + RECOVER).with(as(MARIA))).andExpect(status().isNotFound());
		assertThat(slugs(listArticles(MARIA, ""))).containsExactly(INVOICES);
		assertThat(count(listCategories(MARIA), "facturacion")).isEqualTo(1);
		assertThat(categorySlugs(listCategories(MARIA))).containsExactly("facturacion");
		// El personal sigue viéndolo, ya como borrador.
		assertThat(getArticleBody(LAURA, RECOVER).path("status").asString()).isEqualTo("draft");
	}

	@Test
	void publishingADraftMakesItVisibleOnlyWhenItIsPublic() throws Exception {
		this.mvc.perform(post(API + "/knowledge/articles/" + CHANGE_PLAN + "/publish").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("publishArticle"));
		this.mvc.perform(post(API + "/knowledge/articles/" + ESCALATION + "/publish").with(as(LAURA))).andExpect(status().isOk());

		assertThat(slugs(listArticles(MARIA, ""))).containsExactly(CHANGE_PLAN, INVOICES, RECOVER);
		this.mvc.perform(get(API + "/knowledge/articles/" + ESCALATION).with(as(MARIA))).andExpect(status().isNotFound());
	}

	@Test
	void turningAPublishedArticleInternalHidesItFromCustomers() throws Exception {
		this.mvc.perform(get(API + "/knowledge/articles/" + INVOICES).with(as(MARIA))).andExpect(status().isOk());

		this.patchArticle(LAURA, INVOICES, "0", "{\"visibility\": \"internal\"}");

		this.mvc.perform(get(API + "/knowledge/articles/" + INVOICES).with(as(MARIA))).andExpect(status().isNotFound());
		assertThat(slugs(listArticles(MARIA, ""))).containsExactly(RECOVER);
	}

	@ParameterizedTest(name = "a customer gets 403 on {0}")
	@MethodSource("writes")
	void aCustomerCannotWriteWhateverTheBody(String name, MockHttpServletRequestBuilder request) throws Exception {
		// Un cuerpo inválido o un artículo inexistente no cambian la respuesta: la autorización va antes de leer nada.
		this.mvc.perform(request.with(as(MARIA)).header("If-Match", "\"0\"")).andExpect(status().isForbidden());
	}

	static Stream<Arguments> writes() {
		String invalid = "{\"title\": 7}";
		String json = MediaType.APPLICATION_JSON_VALUE;
		String mergePatch = "application/merge-patch+json";
		return Stream.of(
				Arguments.of("createArticle", post(API + "/knowledge/articles").contentType(json).content(invalid)),
				Arguments.of("createCategory", post(API + "/knowledge/categories").contentType(json).content(invalid)),
				Arguments.of("updateArticle",
						patch(API + "/knowledge/articles/" + RECOVER).contentType(mergePatch).content(invalid)),
				Arguments.of("updateArticle of a missing slug",
						patch(API + "/knowledge/articles/no-existe").contentType(mergePatch).content(invalid)),
				Arguments.of("publishArticle", post(API + "/knowledge/articles/" + RECOVER + "/publish")),
				Arguments.of("unpublishArticle", post(API + "/knowledge/articles/" + RECOVER + "/unpublish")));
	}

	@Test
	void aRejectedCustomerWriteChangesNothing() throws Exception {
		this.mvc.perform(post(API + "/knowledge/articles/" + REFUNDS + "/unpublish").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("unpublishArticle"));

		assertThat(getArticleBody(LAURA, REFUNDS).path("status").asString()).isEqualTo("published");
	}

	@Test
	void anAgentCannotCreateCategories() throws Exception {
		this.mvc.perform(post(API + "/knowledge/categories").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Envíos\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("createCategory"));

		assertThat(categorySlugs(listCategories(ADMIN))).doesNotContain("envios");
	}

	@Test
	void anUnknownUserIsRejectedBeforeAnythingIsRead() throws Exception {
		this.mvc.perform(get(API + "/knowledge/articles").with(as("nadie@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listArticles"));
		this.mvc.perform(get(API + "/knowledge/categories").with(as("nadie@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listCategories"));
	}

	@Test
	void anotherOrganizationSeesNoArticlesAndOwnsItsCategories() throws Exception {
		assertThat(listArticles(NORTHWIND_AGENT, "").path("totalItems").asInt()).isZero();
		this.mvc.perform(get(API + "/knowledge/articles/" + RECOVER).with(as(NORTHWIND_AGENT)))
			.andExpect(status().isNotFound());
		JsonNode categories = listCategories(NORTHWIND_AGENT);
		assertThat(categorySlugs(categories)).containsExactly("cuenta-y-acceso");
		assertThat(count(categories, "cuenta-y-acceso")).isZero();
		// Tampoco puede editar, publicar ni despublicar un artículo ajeno: responde como si no existiera.
		this.mvc.perform(post(API + "/knowledge/articles/" + RECOVER + "/unpublish").with(as(NORTHWIND_AGENT)))
			.andExpect(status().isNotFound());
		this.mvc.perform(post(API + "/knowledge/articles/" + CHANGE_PLAN + "/publish").with(as(NORTHWIND_AGENT)))
			.andExpect(status().isNotFound());
		assertThat(patchArticle(NORTHWIND_AGENT, RECOVER, "0", "{\"title\": \"Mío\"}").getResponse().getStatus())
			.isEqualTo(404);
		assertThat(getArticleBody(LAURA, RECOVER).path("title").asString()).isEqualTo("Cómo recuperar el acceso a tu cuenta");
	}

	@Test
	void twoOrganizationsCanShareASlug() throws Exception {
		String title = "Cómo recuperar el acceso a tu cuenta";
		var created = postArticle(NORTHWIND_AGENT, articleJson(title, "Texto", this.northwindCategory, "public"));

		assertThat(created.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(created).path("slug").asString()).isEqualTo(RECOVER);
		// La de Acme sigue siendo la suya y la de Northwind no se convierte en «-2».
		assertThat(getArticleBody(LAURA, RECOVER).path("category").path("id").asString())
			.isEqualTo(this.accountCategory.toString());
	}

	private JsonNode getArticleBody(String user, String slug) throws Exception {
		return body(getArticle(user, slug));
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

}
