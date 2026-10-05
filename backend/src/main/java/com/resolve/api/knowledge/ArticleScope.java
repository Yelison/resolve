package com.resolve.api.knowledge;

/**
 * Qué artículos puede leer quien consulta, definido en un único sitio: el personal lee todos y los clientes solo
 * los publicados y públicos. La lista, su total, la búsqueda, el detalle y el recuento de las categorías añaden
 * esta restricción a su consulta, así ninguna puede olvidarla.
 */
final class ArticleScope {

	/** Condición JPQL sobre un artículo con alias {@code a}. */
	static final String PUBLISHED_AND_PUBLIC = "a.status = com.resolve.api.knowledge.ArticleStatus.PUBLISHED"
			+ " and a.visibility = com.resolve.api.knowledge.ArticleVisibility.PUBLIC";

	private ArticleScope() {
	}

	/** Fragmento para añadir con AND a una cláusula {@code where}: vacío para el personal. */
	static String restriction(boolean staff) {
		return staff ? "" : " and (" + PUBLISHED_AND_PUBLIC + ")";
	}

}
