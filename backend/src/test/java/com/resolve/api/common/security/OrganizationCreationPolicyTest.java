package com.resolve.api.common.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@code resolve.organizations.creation}: {@code admins} por defecto, {@code open} solo si se pide, y un valor que no es
 * ninguno de los dos impide arrancar con un mensaje que dice qué se esperaba.
 */
class OrganizationCreationPolicyTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
		.withUserConfiguration(OrganizationCreationPolicy.class);

	@Test
	void withoutThePropertyTheDoorIsClosed() {
		this.runner.run((context) -> {
			assertThat(context.getBean(OrganizationCreationPolicy.class).mode()).isEqualTo(OrganizationCreationMode.ADMINS);
			assertThat(context.getBean(OrganizationCreationPolicy.class).isOpen()).isFalse();
		});
	}

	@Test
	void openOpensItAndAdminsKeepsItClosedWhateverTheCaseOrSpaces() {
		for (String value : new String[] { "open", "OPEN", " Open " }) {
			this.runner.withPropertyValues("resolve.organizations.creation=" + value)
				.run((context) -> assertThat(context.getBean(OrganizationCreationPolicy.class).isOpen()).as(value).isTrue());
		}
		for (String value : new String[] { "admins", "Admins", " admins" }) {
			this.runner.withPropertyValues("resolve.organizations.creation=" + value)
				.run((context) -> assertThat(context.getBean(OrganizationCreationPolicy.class).isOpen()).as(value).isFalse());
		}
	}

	@Test
	void anEmptyValueCountsAsNotDefinedSoItNeverOpensTheDoorByAccident() {
		for (String value : new String[] { "", "   " }) {
			this.runner.withPropertyValues("resolve.organizations.creation=" + value)
				.run((context) -> assertThat(context.getBean(OrganizationCreationPolicy.class).mode()).as("«" + value + "»")
					.isEqualTo(OrganizationCreationMode.ADMINS));
		}
	}

	@Test
	void anUnknownValueStopsTheStartAndTheMessageSaysWhatIsExpected() {
		for (String value : new String[] { "opne", "closed", "true", "admin", "open,admins" }) {
			this.runner.withPropertyValues("resolve.organizations.creation=" + value).run((context) -> {
				assertThat(context).as(value).hasFailed();
				assertThat(rootMessage(context.getStartupFailure())).as(value)
					.contains("resolve.organizations.creation")
					.contains("RESOLVE_ORGANIZATIONS_CREATION")
					.contains("«admins»")
					.contains("«open»")
					.contains("«" + value + "»");
			});
		}
	}

	@Test
	void parseRejectsWhatItDoesNotKnow() {
		assertThatThrownBy(() -> OrganizationCreationMode.parse("everyone")).isInstanceOf(IllegalStateException.class);
		assertThat(OrganizationCreationMode.parse(null)).isEqualTo(OrganizationCreationMode.ADMINS);
	}

	private static String rootMessage(Throwable failure) {
		Throwable cause = failure;
		while (cause.getCause() != null) {
			cause = cause.getCause();
		}
		return cause.getMessage();
	}

}
