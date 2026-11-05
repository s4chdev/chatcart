# Stage 1: build the AG Studio merchant dashboard (studio/ -> public/studio).
FROM node:22-alpine AS studio
WORKDIR /app/studio
COPY studio/package*.json ./
RUN npm ci --no-audit --no-fund
COPY studio ./
RUN npm run build

# Stage 2: the plain-JS Express app.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY --from=studio /app/public/studio ./public/studio
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "src/server.js"]
