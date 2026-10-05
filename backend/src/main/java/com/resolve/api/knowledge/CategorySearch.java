package com.resolve.api.knowledge;

import java.util.List;
import java.util.UUID;

public interface CategorySearch {

	/**
	 * Las categorías de la organización por nombre, sin distinguir mayúsculas, con el recuento de lo que el llamante
	 * puede leer (ver {@link ArticleScope}). A un cliente no se le devuelven las que no tienen ningún artículo
	 * visible, para no revelar el nombre de categorías internas.
	 */
	List<CategoryRow> listWithCounts(UUID organizationId, boolean staff);

}
