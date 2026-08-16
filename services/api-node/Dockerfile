# node:25-slim — bundled OpenSSL 3.5.5 (verified 2026-08-16); runs .ts natively (type stripping)
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY sensors.ts tls_state.ts server.ts ./
EXPOSE 8000
CMD ["node", "--import", "@opentelemetry/auto-instrumentations-node/register", "server.ts"]
