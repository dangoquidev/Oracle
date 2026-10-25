import { createServer, type Server } from 'node:http';

export type HealthCheck = () => Promise<boolean> | boolean;

/** `GET /health` answers 200 when every check passes, 503 otherwise (used by Docker). */
export function startHealthServer(port: number, checks: Record<string, HealthCheck>): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    void evaluate(checks).then((results) => {
      const healthy = Object.values(results).every(Boolean);
      response
        .writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: healthy ? 'ok' : 'unhealthy', checks: results }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      resolve(server);
    });
  });
}

async function evaluate(checks: Record<string, HealthCheck>): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        return [name, await check()] as const;
      } catch {
        return [name, false] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
