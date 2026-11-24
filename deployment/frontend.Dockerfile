FROM node:24-alpine@sha256:d8d97e479cdc64f052f81f129362168717c59783ade8dcc1abd22e1cca8dbd7c AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ src/
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:e2a8fca8aa356d66159aaf8a877a9c126773635adf210503eefaaeaffeed6ad7
ARG NEXUS_COMMIT
LABEL org.opencontainers.image.revision=$NEXUS_COMMIT
COPY --from=build /src/dist/ /usr/share/nginx/html/
COPY deployment/frontend.conf.template /etc/nginx/templates/default.conf.template
USER 101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/health/frontend || exit 1
