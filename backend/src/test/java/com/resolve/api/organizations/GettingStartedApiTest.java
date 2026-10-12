package com.resolve.api.organizations;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.ApiIntegrationTest;
import com.resolve.api.support.RowLock;
import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * «Primeros pasos» de Inicio ({@code gettingStarted} en {@code GET /tickets/metrics}): solo para administradores, hasta
 * que las tres están hechas; después {@code null} para siempre, aunque un paso se deshaga. La lectura que lo descubre
 * escribe {@code getting_started_done_at} sin tomar bloqueos que choquen con nada.
 */
class GettingStartedApiTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	private static final String LAURA = "laura@acme.example";

	private static final String NORTHWIND_ADMIN = "admin@northwind.example";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private DataSource dataSource;

	private UUID acme;

	private UUID admin;

	private UUID northwind;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.admin = this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.northwind = this.data.organization("Northwind");
		this.data.staff(this.northwind, "admin", "Ada Norte", NORTHWIND_ADMIN);
		// Estas organizaciones nacen como las que se crean: la migración marca como completadas solo las anteriores.
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofHours(1)));
	}

	private ResultActions metrics(String user) throws Exception {
		return this.mvc.perform(get(API + "/tickets/metrics").with(as(user)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getTicketMetrics"));
	}

	private JsonNode steps(String user) throws Exception {
		return JSON.readTree(metrics(user).andReturn().getResponse().getContentAsString()).path("gettingStarted");
	}

	private Instant doneAt(UUID organization) {
		Timestamp done = this.jdbc.sql("select getting_started_done_at from organizations where id = ?")
			.param(organization)
			.query(Timestamp.class)
			.optional()
			.orElse(null);
		return (done != null) ? done.toInstant() : null;
	}

	private UUID publishedArticle(UUID organization, UUID author, String slug) {
		UUID category = this.data.category(organization, "General " + slug, "general-" + slug);
		return this.data.article(organization, category, slug, "Título " + slug, "Texto", "published", "public", author,
				Instant.parse("2026-10-01T10:00:00Z"));
	}

	@Test
	void aNewOrganizationShowsItsPendingStepsToItsAdminOnly() throws Exception {
		UUID solo = this.data.organization("Solo");
		this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		this.data.staff(solo, "agent", "Agente Solo", "agente@solo.example");
		// Con una persona más en el equipo, el primer paso está hecho y los otros dos no.
		JsonNode steps = steps("sola@solo.example");
		assertThat(steps.path("invitedTeam").asBoolean()).isTrue();
		assertThat(steps.path("addedCustomer").asBoolean()).isFalse();
		assertThat(steps.path("publishedArticle").asBoolean()).isFalse();
		assertThat(steps.size()).isEqualTo(3);
		// Un agente nunca lo ve, aunque el espacio no esté completo; y la lectura no marca nada.
		assertThat(steps("agente@solo.example").isNull()).isTrue();
		assertThat(doneAt(solo)).isNull();
	}

	@Test
	void anOrganizationThatAlreadyCompletedItNeverShowsItEvenWithEveryStepPending() throws Exception {
		this.jdbc.sql("update organizations set getting_started_done_at = ? where id = ?")
			.params(Timestamp.from(TestClockConfiguration.START), this.acme)
			.update();

		assertThat(steps(ADMIN).isNull()).isTrue();
		assertThat(doneAt(this.acme)).isEqualTo(TestClockConfiguration.START);
	}

	@Test
	void invitingSomeoneTurnsTheFirstStepOnAndItStaysEvenWhenTheyAreRemovedOrOnlyInvited() throws Exception {
		// Acme ya tiene dos del equipo (Yelisson y Laura): para probar el paso se parte de un espacio con una persona.
		UUID solo = this.data.organization("Solo");
		UUID sola = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		assertThat(steps("sola@solo.example").path("invitedTeam").asBoolean()).isFalse();

		this.mvc.perform(post(API + "/members").with(as("sola@solo.example"))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Invitado\", \"email\": \"invitado@solo.example\", \"role\": \"agent\"}"))
			.andExpect(status().isCreated());
		assertThat(steps("sola@solo.example").path("invitedTeam").asBoolean()).isTrue();

		// «Alguna vez»: una membresía retirada sigue contando.
		this.jdbc.sql("update memberships set status = 'removed', removed_at = now() where organization_id = ? and user_id <> ?")
			.params(solo, sola)
			.update();
		assertThat(steps("sola@solo.example").path("invitedTeam").asBoolean()).isTrue();
	}

	@Test
	void aCustomerOfThePortalIsNotTeamAndAnotherOrganizationsPeopleDoNotCount() throws Exception {
		UUID solo = this.data.organization("Solo");
		UUID sola = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		UUID customer = this.data.customer(solo, "Cliente", "cliente@solo.example", "Cliente");
		this.data.customerUser(solo, customer, "Cliente", "cliente@solo.example");
		// Que la misma persona esté en otro espacio no cuenta: el equipo de Northwind no es el de Solo.
		this.data.membership(this.northwind, sola, "agent", "active");

		JsonNode steps = steps("sola@solo.example");

		assertThat(steps.path("invitedTeam").asBoolean()).isFalse();
		assertThat(steps.path("addedCustomer").asBoolean()).isTrue();
		assertThat(steps.path("publishedArticle").asBoolean()).isFalse();
		// Y lo de Solo no se cuela en Acme.
		assertThat(steps(ADMIN).path("addedCustomer").asBoolean()).isFalse();
	}

	@Test
	void theCustomerStepSurvivesArchivingTheCustomer() throws Exception {
		UUID solo = this.data.organization("Solo");
		this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		UUID customer = this.data.customer(solo, "Cliente", "cliente@solo.example", "Cliente");
		this.data.archiveCustomer(customer, Instant.parse("2026-10-02T10:00:00Z"));

		assertThat(steps("sola@solo.example").path("addedCustomer").asBoolean()).isTrue();
	}

	@Test
	void thePublishedArticleStepFollowsThePublishedStateUntilTheChecklistIsDone() throws Exception {
		UUID solo = this.data.organization("Solo");
		UUID author = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		UUID category = this.data.category(solo, "General", "general");
		this.data.article(solo, category, "borrador", "Borrador", "Texto", "draft", "internal", author,
				Instant.parse("2026-10-01T10:00:00Z"));
		assertThat(steps("sola@solo.example").path("publishedArticle").asBoolean()).as("un borrador no cuenta").isFalse();
		// Otra organización con un artículo publicado no cuenta.
		publishedArticle(this.acme, this.admin, "de-acme");
		assertThat(steps("sola@solo.example").path("publishedArticle").asBoolean()).isFalse();

		this.mvc.perform(post(API + "/knowledge/articles/borrador/publish").with(as("sola@solo.example")))
			.andExpect(status().isOk());
		assertThat(steps("sola@solo.example").path("publishedArticle").asBoolean()).isTrue();
		// Despublicar borra published_at: la API no sabe que estuvo publicado. Limitación documentada del paso.
		this.mvc.perform(post(API + "/knowledge/articles/borrador/unpublish").with(as("sola@solo.example")))
			.andExpect(status().isOk());
		assertThat(steps("sola@solo.example").path("publishedArticle").asBoolean()).isFalse();
	}

	@Test
	void whenTheThreeHoldItIsNullAtOnceTheMarkIsWrittenOnceAndItNeverComesBack() throws Exception {
		UUID solo = this.data.organization("Solo");
		UUID author = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		this.data.staff(solo, "agent", "Otra", "otra@solo.example");
		this.data.customer(solo, "Cliente", "cliente@solo.example", "Cliente");
		assertThat(steps("sola@solo.example").path("publishedArticle").asBoolean()).isFalse();
		assertThat(doneAt(solo)).isNull();
		UUID article = publishedArticle(solo, author, "primero");

		// La lectura que ve las tres hechas responde null y deja escrita la marca con la hora del reloj.
		assertThat(steps("sola@solo.example").isNull()).isTrue();
		assertThat(doneAt(solo)).isEqualTo(TestClockConfiguration.START.plus(Duration.ofHours(1)));

		// Después no vuelve aunque el artículo se despublique, la persona se retire y el reloj avance; y la marca no se pisa.
		this.jdbc.sql("update articles set status = 'draft', published_at = null where id = ?").param(article).update();
		this.jdbc.sql("update memberships set status = 'removed' where organization_id = ? and user_id <> ?")
			.params(solo, author)
			.update();
		this.clock.set(TestClockConfiguration.START.plus(Duration.ofDays(3)));
		assertThat(steps("sola@solo.example").isNull()).isTrue();
		assertThat(doneAt(solo)).isEqualTo(TestClockConfiguration.START.plus(Duration.ofHours(1)));
		// Otra organización pendiente sigue mostrándolo: la marca es por organización.
		assertThat(steps(ADMIN).isNull()).isFalse();
	}

	@Test
	void readingDoesNotBumpTheSettingsVersionSoAnEditInProgressIsNotRejected() throws Exception {
		UUID solo = this.data.organization("Solo");
		UUID author = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		this.data.staff(solo, "agent", "Otra", "otra@solo.example");
		this.data.customer(solo, "Cliente", "cliente@solo.example", "Cliente");
		publishedArticle(solo, author, "primero");

		assertThat(steps("sola@solo.example").isNull()).isTrue();

		this.mvc.perform(get(API + "/organization").with(as("sola@solo.example")))
			.andExpect(jsonPath("$.version").value(0));
		assertThat(doneAt(solo)).isNotNull();
	}

	/**
	 * Que una lectura escriba no puede esperar nada: si otra transacción retiene la fila de la organización (reservar un
	 * número de ticket, editar los ajustes) la lectura responde igual, sin esperar, y la marca se escribe en la siguiente.
	 */
	@Test
	void aRowHeldByAnotherTransactionNeitherDelaysTheReadNorLosesTheMark() throws Exception {
		UUID solo = this.data.organization("Solo");
		UUID author = this.data.staff(solo, "admin", "Sola Admin", "sola@solo.example");
		this.data.staff(solo, "agent", "Otra", "otra@solo.example");
		this.data.customer(solo, "Cliente", "cliente@solo.example", "Cliente");
		publishedArticle(solo, author, "primero");

		try (RowLock lock = RowLock.hold(this.dataSource, "select id from organizations where id = ? for no key update", solo)) {
			long start = System.nanoTime();
			assertThat(steps("sola@solo.example").isNull()).isTrue();
			assertThat(Duration.ofNanos(System.nanoTime() - start)).as("la lectura no espera el bloqueo")
				.isLessThan(Duration.ofSeconds(2));
			assertThat(doneAt(solo)).as("la marca no se escribió con la fila retenida").isNull();
		}

		assertThat(steps("sola@solo.example").isNull()).isTrue();
		assertThat(doneAt(solo)).isEqualTo(TestClockConfiguration.START.plus(Duration.ofHours(1)));
	}

}
