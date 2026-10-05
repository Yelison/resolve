package com.resolve.api.knowledge;

/**
 * Punto de extensión que solo implementan los tests: {@link ArticleService#create} lo invoca cuando ya eligió el
 * slug y todavía no guardó el artículo, con el bloqueo de las altas de la organización tomado, para poder aparcar un
 * alta a mitad de la transacción. En producción no hay ningún bean de este tipo y no se ejecuta nada.
 */
interface ArticleSlugHook {

	void afterSlugChosen();

}
