# syntax=docker/dockerfile:1
#
# Una sola imagen con la API y la aplicación web (la API sirve el `dist` de Vite desde el mismo origen, ver
# SpaResources). Tres etapas: la aplicación web, el jar con ella dentro y el entorno de ejecución. Ninguna variable ni
# secreto se escribe en la imagen: la configuración llega en el arranque (docs/deploy/README.md).
#
#   docker build -t resolve:local .

# Las imágenes base van fijadas por digest del índice multiarquitectura (una compilación repetible no cambia con una
# etiqueta movida); Dependabot (ecosistema docker) propone el digest nuevo.
# --- Aplicación web -----------------------------------------------------------------------------------------------
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

# --- Jar de la API con la aplicación web en static/ ---------------------------------------------------------------
FROM maven:3.10-eclipse-temurin-25@sha256:0396dcd8cd0d46a0d2026449b714b2a5bbe53cce030975b5a41f8ffa3f5f0525 AS api
WORKDIR /api
COPY backend/pom.xml ./
COPY backend/src ./src
COPY --from=web /web/dist ./src/main/resources/static
# Sin tests: se ejecutan en la integración continua, y los de contrato leen docs/, que no entra en el contexto.
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -Dmaven.test.skip=true package \
    && cp target/resolve-api-*.jar /app.jar

# --- Ejecución ----------------------------------------------------------------------------------------------------
FROM eclipse-temurin:25-jre@sha256:fcd7fd7b387f94bb2ac461478a7436ad8e349924c374ea8313919624dceae636
# Un usuario sin privilegios y sin shell de inicio de sesión: la aplicación no necesita escribir en el sistema de archivos.
RUN groupadd --system --gid 10001 resolve \
    && useradd --system --uid 10001 --gid resolve --no-create-home --shell /usr/sbin/nologin resolve
COPY --from=api --chown=root:root /app.jar /app/app.jar
USER 10001:10001
# Con el perfil prod no hay valores por defecto de la base de datos ni del proveedor de identidad: sin sus variables el
# arranque falla nombrando la que falta. El perfil sí tiene valor por defecto, para que una imagen sin configurar no
# pueda arrancar con el inicio de sesión de demostración.
ENV SPRING_PROFILES_ACTIVE=prod,oidc \
    SERVER_PORT=8080
EXPOSE 8080
# La imagen no trae curl ni wget: la sonda de disponibilidad se hace con un socket de bash. HTTP/1.0 para que el servidor
# cierre la conexión al responder.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${SERVER_PORT:-8080} && printf 'GET /api/actuator/health/readiness HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n' >&3 && grep -q '\"status\":\"UP\"' <&3"]
# El ENTRYPOINT sustituye al /__cacert_entrypoint.sh de Temurin, que solo actúa con USE_SYSTEM_CA_CERTS (no se define
# aquí); el almacén de la JVM ya trae las CA públicas que usan Neon y Fly.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
