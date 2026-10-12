package com.resolve.api.organizations;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.resolve.api.common.persistence.Ids;
import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El color de un id es el mismo lo calcule Java (espacios nuevos) o la función {@code organization_color} de la migración
 * V10 (filas existentes y las insertadas sin color): el último byte del id módulo 8, sobre la misma lista de claves.
 */
class OrganizationColorsTest extends ApiIntegrationTest {

	@Autowired
	private JdbcClient jdbc;

	private String sqlColor(UUID id) {
		return this.jdbc.sql("select organization_color(?)").param(id).query(String.class).single();
	}

	@Test
	void theEightKeysAreTheContractsInOrder() {
		assertThat(OrganizationColors.KEYS).containsExactly("blue", "green", "magenta", "orange", "violet", "teal",
				"brick", "slate");
	}

	@Test
	void javaAndSqlAgreeForEveryPossibleLastByteAndForRealIds() {
		List<UUID> ids = new ArrayList<>();
		for (int lastByte = 0; lastByte < 256; lastByte++) {
			ids.add(new UUID(0x0192f00000007000L, 0x8000000000000000L | lastByte));
		}
		for (int i = 0; i < 300; i++) {
			ids.add(Ids.newId());
		}
		// Cualquier combinación de los bits altos de la mitad baja: solo cuenta el último byte.
		ids.add(new UUID(-1L, -1L));
		ids.add(new UUID(0L, 0L));
		ids.add(new UUID(0x0192f00000007000L, 0xFFFFFFFFFFFFFF00L));

		for (UUID id : ids) {
			assertThat(OrganizationColors.forId(id)).as(id.toString()).isEqualTo(sqlColor(id));
		}
	}

	@Test
	void everyKeyIsReachableAndNewIdsSpreadAcrossThePalette() {
		List<String> seen = new ArrayList<>();
		for (int i = 0; i < 400; i++) {
			String color = OrganizationColors.forId(Ids.newId());
			if (!seen.contains(color)) {
				seen.add(color);
			}
		}
		assertThat(seen).containsExactlyInAnyOrderElementsOf(OrganizationColors.KEYS);
	}

	@Test
	void anOrganizationInsertedWithoutColorGetsTheOneOfItsIdAndAnExplicitColorIsKept() {
		UUID plain = this.data.organization("Sin color");
		UUID chosen = Ids.newId();
		this.jdbc.sql("insert into organizations (id, name, time_zone, color) values (?, 'Con color', 'America/Bogota', 'slate')")
			.param(chosen)
			.update();

		assertThat(this.jdbc.sql("select color from organizations where id = ?").param(plain).query(String.class).single())
			.isEqualTo(OrganizationColors.forId(plain));
		assertThat(this.jdbc.sql("select color from organizations where id = ?").param(chosen).query(String.class).single())
			.isEqualTo("slate");
	}

	@Test
	void theDatabaseRejectsAnyOtherKey() {
		UUID id = Ids.newId();
		assertThatThrownBy(() -> this.jdbc
			.sql("insert into organizations (id, name, time_zone, color) values (?, 'Rosa', 'America/Bogota', 'pink')")
			.param(id)
			.update()).isInstanceOf(DataIntegrityViolationException.class);
		UUID other = this.data.organization("Existente");
		assertThatThrownBy(() -> this.jdbc.sql("update organizations set color = 'Blue' where id = ?").param(other).update())
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> this.jdbc.sql("update organizations set color = null where id = ?").param(other).update())
			.isInstanceOf(DataIntegrityViolationException.class);
	}

}
