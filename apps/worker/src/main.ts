import 'dotenv/config';
import { createServer } from 'node:http';
import { loadServerConfig, dependenciesReady, probeTcpUrl } from '@fluentcoach/infrastructure';

const config = loadServerConfig(process.env);
const port = Number(process.env['WORKER_HEALTH_PORT'] ?? 3001);

createServer((request, response) => { void handleRequest(request.url, response); }).listen(port, '0.0.0.0');

async function handleRequest(url: string | undefined, response: import('node:http').ServerResponse): Promise<void> {
  response.setHeader('content-type', 'application/json');
  if (url === '/health/live') {
    response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
    return;
  }
  if (url === '/health/ready') {
    const ready = await dependenciesReady([
      async () => await probeTcpUrl(config.DATABASE_URL),
      async () => await probeTcpUrl(config.REDIS_URL)
    ]);
    response.statusCode = ready ? 200 : 503;
    response.end(JSON.stringify({ status: ready ? 'ok' : 'not-ready', service: 'worker' }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not-found' }));
}
