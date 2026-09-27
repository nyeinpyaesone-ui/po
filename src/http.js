import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
});

export function createHttp({ config, store, classify, validateType, boundaryResult, provider }) {
  const rate = new Map();
  const requestId = req => typeof req.headers['x-request-id'] === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(req.headers['x-request-id']) ? req.headers['x-request-id'] : crypto.randomUUID();
  const securityHeaders = (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('content-security-policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; style-src 'self'; script-src 'self'; connect-src 'self'");
    if (config.corsOrigin) {
      const origin = req.headers.origin;
      if (origin === config.corsOrigin) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('vary', 'Origin');
      }
    }
  };
  const json = (res, status, body, headers = {}) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(payload), ...headers });
    res.end(payload);
  };
  const fail = (res, status, code, message, id) => json(res, status, { error: { code, message, requestId: id } });

  async function readJson(req) {
    const contentType = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') throw Object.assign(new Error('Content-Type must be application/json'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > config.maxBodyBytes) throw Object.assign(new Error('Request body too large'), { status: 413, code: 'BODY_TOO_LARGE' });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400, code: 'INVALID_JSON' }); }
  }

  function allowed(req) {
    const key = req.socket.remoteAddress || 'unknown';
    const now = Date.now(); const current = rate.get(key);
    if (!current || now - current.start >= config.rateWindowMs) { rate.set(key, { start: now, count: 1 }); return true; }
    current.count += 1; return current.count <= config.rateLimit;
  }

  function authenticated(req) {
    if (!config.apiToken) return true;
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(header.slice(7));
    const expected = Buffer.from(config.apiToken);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }

  function requireAuth(req, res, id) {
    if (authenticated(req)) return true;
    fail(res, 401, 'UNAUTHORIZED', 'Authentication required', id);
    return false;
  }

  async function createTask(input, id) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('body must be an object'), { status: 400, code: 'VALIDATION_ERROR' });
    if (typeof input.prompt !== 'string') throw Object.assign(new Error('prompt must be a string'), { status: 400, code: 'VALIDATION_ERROR' });
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > config.maxPromptLength) throw Object.assign(new Error(`prompt must be 1-${config.maxPromptLength} characters`), { status: 400, code: 'VALIDATION_ERROR' });
    const type = input.type || classify(prompt);
    if (!validateType(type)) throw Object.assign(new Error('type must be general, code, or browser'), { status: 400, code: 'VALIDATION_ERROR' });
    const task = store.addTask({ id: crypto.randomUUID(), type, prompt, status: 'queued', createdAt: new Date().toISOString(), requestId: id });
    store.addAudit({ action: 'task.created', taskId: task.id, type, requestId: id });
    queueMicrotask(() => runTask(task));
    return task;
  }

  async function runTask(task) {
    store.updateTask(task.id, { status: 'running', startedAt: new Date().toISOString() });
    const boundary = boundaryResult(task.type);
    if (boundary) {
      store.updateTask(task.id, { status: 'completed', completedAt: new Date().toISOString(), output: boundary });
      store.addAudit({ action: 'task.completed', taskId: task.id, mode: 'boundary' });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.taskTimeoutMs);
    try {
      const output = await provider.generate(task.prompt, controller.signal);
      const safeOutput = typeof output?.message === 'string' && output.message.length > config.maxOutputLength
        ? { ...output, message: output.message.slice(0, config.maxOutputLength), truncated: true }
        : output;
      store.updateTask(task.id, { status: 'completed', completedAt: new Date().toISOString(), output: safeOutput });
      store.addAudit({ action: 'task.completed', taskId: task.id, provider: provider.id });
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'Task timed out' : error?.message || 'Task failed';
      store.updateTask(task.id, { status: 'failed', completedAt: new Date().toISOString(), error: { code: error?.name === 'AbortError' ? 'TASK_TIMEOUT' : 'TASK_FAILED', message } });
      store.addAudit({ action: 'task.failed', taskId: task.id, message });
    } finally { clearTimeout(timeout); }
  }

  async function staticFile(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method)) return false;
    let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { return false; }
    const root = path.resolve(config.publicDir); const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const file = path.resolve(root, relative); const check = path.relative(root, file);
    if (check.startsWith('..') || path.isAbsolute(check)) return false;
    let stat; try { stat = await fs.promises.stat(file); } catch { return false; }
    if (!stat.isFile()) return false;
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': decoded === '/' ? 'no-cache' : 'public, max-age=300', 'content-length': stat.size });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    return true;
  }

  return async function handler(req, res) {
    const id = requestId(req); res.setHeader('x-request-id', id); securityHeaders(req, res);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'OPTIONS') {
        if (config.corsOrigin && req.headers.origin === config.corsOrigin) {
          res.writeHead(204, { 'access-control-allow-origin': config.corsOrigin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type,x-request-id', 'access-control-max-age': '600' });
          return res.end();
        }
        return fail(res, 403, 'CORS_FORBIDDEN', 'Origin not allowed', id);
      }
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', service: config.service, version: config.version });
      if (req.method === 'GET' && url.pathname === '/ready') {
        const ready = await provider.ready();
        return json(res, ready ? 200 : 503, { status: ready ? 'ready' : 'degraded', service: config.service, provider: provider.id });
      }
      if (req.method === 'GET' && url.pathname === '/api/v1') return json(res, 200, { name: config.name, version: config.version, apiVersion: 'v1' });
      if (req.method === 'GET' && url.pathname === '/api/v1/capabilities') return json(res, 200, { capabilities: [{ id: 'task-routing', enabled: true }, { id: 'deterministic-tasks', enabled: provider.id === 'deterministic' }, { id: 'ollama', enabled: provider.id === 'ollama' }, { id: 'code-boundary', enabled: true }, { id: 'browser-boundary', enabled: false }, { id: 'sse-events', enabled: true }, { id: 'api-auth', enabled: Boolean(config.apiToken) }] });
      if (req.method === 'GET' && url.pathname === '/api/v1/providers') return json(res, 200, { providers: [{ id: provider.id, enabled: provider.enabled }] });
      if (req.method === 'GET' && url.pathname === '/api/v1/tasks') { if (!requireAuth(req, res, id)) return; const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 100); return json(res, 200, { tasks: store.recentTasks(limit) }); }
      if (req.method === 'GET' && url.pathname === '/api/v1/audit') { if (!requireAuth(req, res, id)) return; return json(res, 200, { events: store.audit.slice(-100) }); }
      if (req.method === 'GET' && url.pathname === '/api/v1/events/stream') {
        if (!requireAuth(req, res, id)) return;
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: ready\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`); store.clients.add(res);
        const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); store.clients.delete(res); } }, config.sseHeartbeatMs);
        req.on('close', () => { clearInterval(heartbeat); store.clients.delete(res); }); return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
        if (!requireAuth(req, res, id)) return;
        if (!allowed(req)) return fail(res, 429, 'RATE_LIMITED', 'Too many requests', id);
        const task = await createTask(await readJson(req), id);
        return json(res, 202, task, { location: `/api/v1/tasks/${task.id}` });
      }
      const match = url.pathname.match(/^\/api\/v1\/tasks\/([0-9a-f-]{36})$/i);
      if (req.method === 'GET' && match) { if (!requireAuth(req, res, id)) return; const task = store.getTask(match[1]); return task ? json(res, 200, task) : fail(res, 404, 'TASK_NOT_FOUND', 'Task not found', id); }
      if (url.pathname.startsWith('/api/')) return fail(res, 404, 'NOT_FOUND', 'Route not found', id);
      if (await staticFile(req, res, url)) return;
      return fail(res, 404, 'NOT_FOUND', 'Route not found', id);
    } catch (error) {
      const status = Number(error?.status) || 500; store.addAudit({ action: 'request.error', requestId: id, status, code: error?.code || 'INTERNAL_ERROR' });
      return fail(res, status, error?.code || 'INTERNAL_ERROR', status >= 500 ? 'Internal server error' : error.message, id);
    }
  };
}
