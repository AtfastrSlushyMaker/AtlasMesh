# AtlasMesh: globe + Intel workspace in one container.
#   docker build -t atlasmesh .
#   docker run -p 127.0.0.1:3000:3000 -v atlasmesh-data:/app/server/data atlasmesh

FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared shared
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    # Requests reach the app through Docker's bridge, not loopback, so allow
    # Settings from any client. Publish the port on 127.0.0.1 only (see README),
    # or set OSINT_ACCESS_KEY if other machines can reach it.
    ATLAS_ALLOW_SETTINGS=1
WORKDIR /app
# Runtime needs only the server's production dependencies; Cesium, Vite and
# TypeScript stay in the build stage.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY server/start.cjs server/
RUN npm ci --workspace server --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p server/data server/.cache && chown -R node:node server/data server/.cache
USER node
WORKDIR /app/server
VOLUME ["/app/server/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/index.js"]
