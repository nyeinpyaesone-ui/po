# NarrateClaude Lite

Professional lightweight task-runtime baseline for local development and Render Web Services.

## Runtime

- Node.js 22–24
- Native Node HTTP server
- Zero runtime dependencies
- Deterministic provider by default
- Optional Ollama provider
- In-memory bounded task/audit state
- Server-Sent Events

## API

- GET /health — shallow liveness probe
- GET /ready — provider readiness
- GET /api/v1 — API metadata
- GET /api/v1/capabilities — capability discovery
- GET /api/v1/providers — provider status
- POST /api/v1/tasks — create task
- GET /api/v1/tasks/:id — task status/result
- GET /api/v1/tasks — recent tasks; protected when API_TOKEN is set
- GET /api/v1/audit — bounded audit stream; protected when API_TOKEN is set
- GET /api/v1/events/stream — task/audit SSE; protected when API_TOKEN is set

## Security

Set API_TOKEN for any remotely reachable deployment. /health and /ready remain unauthenticated for infrastructure probes. No arbitrary shell execution is provided. Code and browser requests terminate at explicit capability boundaries.

## Local

npm ci
npm run build
npm test
npm start

Open http://127.0.0.1:10000/.

## Render

render.yaml configures a Singapore Free web service named po, npm ci && npm run build, npm start, and /health. The application binds to 0.0.0.0:$PORT.

Ollama must be reachable from the Render runtime; localhost refers to the Render instance, not a developer workstation.
