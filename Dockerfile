# Cloud Run image for the CAR-IA back-end/engine (app-API).
# Build produces dist/server.cjs (Express server) + dist/ (Vite front build).
FROM node:22-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy the rest and build the production bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); server.ts reads process.env.PORT.
CMD ["node", "dist/server.cjs"]
