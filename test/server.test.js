import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 19128;
let child;
const request = (path, options) => fetch(`http://127.0.0.1:${port}${path}`, options);
async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { try { if ((await request('/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); }
  throw new Error('server did not start');
}

test.before(async () => { child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), OLLAMA_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] }); await waitForServer(); });
test.after(async () => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
});

test('health and readiness', async () => { assert.equal((await request('/health')).status, 200); assert.equal((await request('/ready')).status, 200); });
test('task lifecycle is asynchronous', async () => {
  const response = await request('/api/v1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'summarize this task' }) });
  assert.equal(response.status, 202); const task = await response.json(); assert.equal(task.status, 'queued');
  const deadline = Date.now() + 2000; let final;
  while (Date.now() < deadline) { final = await (await request(`/api/v1/tasks/${task.id}`)).json(); if (final.status === 'completed') break; await new Promise(r => setTimeout(r, 25)); }
  assert.equal(final.status, 'completed'); assert.equal(final.output.kind, 'result');
});
test('code and browser tasks remain bounded', async () => {
  for (const prompt of ['debug this TypeScript function', 'navigate to a website']) {
    const r = await request('/api/v1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
    assert.equal(r.status, 202); const t = await r.json(); assert.ok(['code', 'browser'].includes(t.type));
  }
});
test('invalid input is rejected', async () => {
  const r = await request('/api/v1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '' }) });
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'VALIDATION_ERROR');
});
test('dashboard is served', async () => { const r = await request('/'); assert.equal(r.status, 200); assert.match(await r.text(), /NarrateClaude Lite/); });
test('security headers and request correlation are present', async () => { const r = await request('/health'); assert.equal(r.status, 200); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('x-request-id') || '', /^[A-Za-z0-9-]{20,}$/); });
