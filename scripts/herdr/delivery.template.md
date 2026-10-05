# Entrega · {título de la tarea}

<!-- Plantilla de scripts/herdr/delivery.template.md. Copia este archivo a la ruta de entrega del brief, rellena cada
sección y conserva los títulos y su orden. Sin una sección, escribe «No aplica» y por qué; no la borres. Borra estos
comentarios. -->

## Resumen

<!-- Qué hace el cambio, por qué y cómo se comporta; unas pocas líneas. -->

## Commits

<!-- Salida de `git log --oneline <base completa>..HEAD`. Por commit, una línea con lo que cambia; si juntaste dos
capas en un commit, explica por qué. -->

```text
```

## Pruebas con cifras base y final

<!-- Cada comando del brief con su resultado en el commit base y en HEAD, con cifras (tests, archivos, tiempo).
Un `pasa` sin número no sirve. Anota los fallos bajo carga repetidos en aislado. -->

| Comando | Base | Final |
| --- | --- | --- |

## Los tests nuevos fallan sin su cambio

<!-- Por cada test nuevo: la mutación que lo hace fallar, el resultado sin el cambio y cómo restauraste el archivo
(desde un commit o una copia, nunca con `git checkout --` sobre cambios sin guardar). -->

| Test | Mutación | Resultado sin el cambio |
| --- | --- | --- |

## Autocomprobación

<!-- Los puntos de «Autocomprobación antes de entregar» del brief, uno por uno, con la evidencia o «No aplica» y por
qué. -->

## Desviaciones y decisiones

<!-- Qué se hizo distinto de lo pedido y por qué; decisiones tomadas donde el brief no decía nada; decisiones que
quedan para el coordinador. -->

## Limitaciones

<!-- Lo que no se probó, lo que depende del entorno y lo que queda fuera del alcance. -->

## Esfuerzo usado

<!-- Nivel de tu sesión (cabecera de Claude Code), si echaste en falta más y si algo se repitió por falta de contexto. -->

## `git status --short`

<!-- Pega la salida tal cual. Vacía si todo está en commits. -->

```text
```

ENTREGA {carril}: LISTA

<!-- Última línea, sola. Si no puedes terminar: BLOQUEO {carril}: {motivo} (y escribe también blocked.md). -->
