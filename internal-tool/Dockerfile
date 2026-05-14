FROM node:22-alpine

WORKDIR /app

# Install frontend deps first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy the full project (this includes ../ai-agent/ontology only if you build from the
# monorepo root with this Dockerfile path — but we build from /internal-tool, so we
# only get this folder's files. That is fine; ontology files will fall back to a stub.)
COPY . .

# Install backend deps
RUN cd server && npm install

# Build args for the Vite frontend
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE_URL=""
ARG VITE_APP_VERSION=dev

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

EXPOSE 8080
ENV PORT=8080

CMD ["node", "server/src/index.js"]
