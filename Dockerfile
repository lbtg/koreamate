FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/app/data/platform.sqlite
COPY --from=build /app/dist ./dist
COPY server ./server
# The pricing rules are shared: the browser quotes with them and the server charges
# with them, so server/app.mjs imports ../src/pricing.js and the runtime image needs
# that one file even though the rest of src/ is only build input. Leaving it out does
# not fail the build — it fails at container start, which is a worse place to find
# out. tests/image.test.mjs checks every ../src/ import here is copied.
COPY src/pricing.js ./src/pricing.js
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/app.mjs"]
