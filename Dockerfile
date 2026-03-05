# syntax=docker/dockerfile:1.7

# Step 1: Build the React app
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Non-sensitive values
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}

# Sensitive values via BuildKit secrets (not ARG/ENV)
RUN --mount=type=secret,id=VITE_SUPABASE_ANON_KEY \
    --mount=type=secret,id=VITE_GEMINI_API_KEY \
    export VITE_SUPABASE_ANON_KEY="$(cat /run/secrets/VITE_SUPABASE_ANON_KEY 2>nul || true)" && \
    export VITE_GEMINI_API_KEY="$(cat /run/secrets/VITE_GEMINI_API_KEY 2>nul || true)" && \
    npm run build

# Step 2: Serve using Nginx
FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]