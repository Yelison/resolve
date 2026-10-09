
## Commits

Los de la ficha, en inglés, Conventional Commits; cada uno compila y pasa por sí solo las comprobaciones de su capa (si la cobertura del contrato obliga a juntar contrato e implementación de una operación, hazlo y explícalo). Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Identidad de git ya configurada. **Sin push ni PR.** Formatea solo tus archivos (`npm run format` o Prettier sobre las rutas autorizadas, nunca sobre `src` entero: reformatearía archivos generados).

## Uso de la máquina (varios agentes en paralelo)

- **Toda prueba pesada pasa por el candado de la máquina**, `scripts/herdr/heavy.sh`: Playwright (cualquier ejecución, incluidas las mutaciones), Vitest en navegador y `./mvnw -B verify`. Ejemplo desde `frontend/`: `../scripts/herdr/heavy.sh npx playwright test e2e/<feature>.spec.ts --workers=2`. Solo corre una batería a la vez entre todos los agentes y proyectos, y a prioridad baja; si otra está en marcha, la tuya espera su turno. No lo esquives.
- **Nunca ejecutes la batería completa de Playwright en local**, ni sobre la base ni antes de entregar: la ejecuta la CI en el PR antes de fusionar (`ship.sh` espera los checks obligatorios). En local, ejecuta las specs que tu cambio puede afectar (las de tu feature, las de los componentes compartidos que toques y las que cambies), y lista en la entrega qué specs ejecutaste.
- Para confirmar la base basta `npm test` (o `./mvnw -B verify` si tocas backend).
- Vitest con `npm test -- --maxWorkers=2` y Playwright siempre con `--workers=2` (la máquina, de 12 núcleos, la comparten varios proyectos). Si un test falla solo bajo carga, repítelo aislado antes de tocar código y anótalo en la entrega.

## Mutaciones y órdenes peligrosas

- **Antes de mutar código para comprobar un test, haz commit** (o guarda una copia del archivo en tu scratchpad) y restaura desde ese commit o esa copia. Nunca restaures con `git checkout -- <archivo>` sobre un archivo con cambios sin commitear: ya se perdió trabajo así tres veces.
- En cualquier `rm`, usa rutas literales o variables protegidas (`"${DIR:?}"/x`): una orden con una variable que podría quedar vacía se queda esperando aprobación y, sin nadie mirando, se deniega y te atasca.
- `docker compose` siempre con tu proyecto (`-p <COMPOSE_PROJECT_NAME de .env.herdr>`); no toques contenedores ni procesos que no arrancaste. Antes de entregar, comprueba que los puertos de tu slot están libres.

## Autocomprobación antes de entregar

Los revisores encuentran casi siempre estos defectos. Compruébalos tú y cita la evidencia en la entrega:

- **Tests que fallan sin su arreglo:** para cada test nuevo, una mutación que lo hace fallar (anótala). Un test que pasa sin el cambio no cuenta.
- **Sin saltos de layout:** con la petición retenida (`page.route`), mide que el contenido siguiente no se mueve al llegar los datos, en la primera carga y al cambiar filtros o periodos. El esqueleto reserva la altura real: componentes reales ocultos o un token compartido, nunca números mágicos.
- **Anchos de CLAUDE.md:** 320, 390, 767, 768, 1024, 1199, 1200 y 1440 px, en ambos temas: sin scroll horizontal, sin textos recortados (nombres de 120 caracteres), controles táctiles de 44 px por debajo de 768 px.
- **Foco:** tras cerrar un diálogo, borrar o perder el disparador, el foco va a un sitio con sentido (nunca a `body`); con teclado se llega a todo.
- **Anuncios:** errores, avisos y cambios de estado asíncronos en una región viva o asociados al campo (`aria-describedby`), con textos distintos para botones con la misma acción («Reintentar…»).
- **Matriz §2.1:** carga, vacío, sin resultados, error con reintento, sin permisos y página fuera de rango, cada uno con su test; los errores de una parte no ocultan las demás.
- **Contrato:** los mocks de e2e y de tests unitarios cumplen el esquema (`additionalProperties: false`: ni campos de más ni de menos).
- **Roles:** lo que un rol no puede hacer no se muestra; lo que se muestra mientras `/me` carga es lo del rol con menos permisos.
- **Commits:** cada uno pasa por sí solo, y si un cambio rompe un e2e, el e2e cambia en el mismo commit.

## Entrega

`__DELIVERY__`, siguiendo la plantilla `scripts/herdr/delivery.template.md` del repositorio si existe en tu base (si no, con estas secciones): comportamiento, archivos, commits (`git log --oneline __BASEFULL__..HEAD`), pruebas con cifras, demostración de que los tests nuevos fallan sin su cambio, esfuerzo usado, limitaciones, decisiones pendientes y `git status --short`. Termina con `ENTREGA __LANE__: LISTA` o `BLOQUEO __LANE__: <motivo>`.

## Comunica al coordinador

Escribe `blocked.md` y termina con `BLOQUEO __LANE__: …` si necesitas un archivo reservado o una dependencia, si un test falla en el commit base, si el plan contradice el código de forma que cambie el alcance, o si un paso pide permisos o configuración global. No ejecutes `/effort` con ningún nivel ni elijas una fila en `/advisor`. Nunca uses `rm` con variables que puedan quedar vacías. No mates procesos que no hayas arrancado tú, y nunca uses `pkill -f`: para lo tuyo por PID. Limpia tus contenedores al terminar.
