# Multi-stage build: Node builds the React app, nginx serves the static output.
# Both Node and nginx images are open source (MIT and BSD respectively).

# ---------- Stage 1: Build with Vite ----------
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: Serve static files via nginx ----------
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK CMD wget -q -O- http://localhost/ || exit 1
