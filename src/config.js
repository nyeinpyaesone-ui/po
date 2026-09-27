import path from 'node:path';

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const config = Object.freeze({
  service: 'po',
  name: 'NarrateClaude Lite',
  version: '0.5.1',
  host: '0.0.0.0',
  port: intEnv('PORT', 10000, 1, 65535),
  publicDir: path.resolve(process.env.PUBLIC_DIR || 'public'),
  maxBodyBytes: 256 * 1024,
  maxPromptLength: 12_000,
  maxTasks: 1_000,
  maxAuditEvents: 2_000,
  rateWindowMs: 60_000,
  rateLimit: 60,
  sseHeartbeatMs: 20_000,
  taskTimeoutMs: intEnv('TASK_TIMEOUT_MS', 30_000, 1_000, 120_000),
  ollamaUrl: (process.env.OLLAMA_URL || '').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma2:2b',
  apiToken: process.env.API_TOKEN || '',
  corsOrigin: process.env.CORS_ORIGIN || '',
  maxOutputLength: intEnv('MAX_OUTPUT_LENGTH', 20_000, 256, 100_000)
});
