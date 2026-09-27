import http from 'node:http';
import { config } from './src/config.js';
import { createStore } from './src/store.js';
import { classify, validateType, boundaryResult } from './src/router.js';
import { createProvider } from './src/provider.js';
import { createHttp } from './src/http.js';

const store = createStore(config);
const provider = createProvider(config);
const handler = createHttp({ config, store, classify, validateType, boundaryResult, provider });
const server = http.createServer(handler);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 30_000;
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of store.clients) { try { client.end(); } catch {} }
  server.close(error => { if (error) { console.error(JSON.stringify({ event: 'server_shutdown_error', signal, message: error.message })); process.exitCode = 1; } else { process.exitCode = 0; } });
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.on('error', error => { console.error(JSON.stringify({ event: 'server_error', code: error.code, message: error.message })); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'server_started', service: config.service, version: config.version, provider: provider.id, host: config.host, port: config.port })));
