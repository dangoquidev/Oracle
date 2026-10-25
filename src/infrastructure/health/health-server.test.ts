import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { startHealthServer } from './health-server.js';

describe('health server', () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
  });

  const url = (path: string) => `http://127.0.0.1:${(server?.address() as AddressInfo).port}${path}`;

  it('reports healthy when every check passes', async () => {
    server = await startHealthServer(0, { database: () => Promise.resolve(true), discord: () => true });
    const response = await fetch(url('/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: { database: true, discord: true } });
  });

  it('reports unhealthy when a check fails or throws', async () => {
    server = await startHealthServer(0, {
      discord: () => false,
      database: () => Promise.reject(new Error('down')),
    });
    const response = await fetch(url('/health'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'unhealthy',
      checks: { discord: false, database: false },
    });
  });

  it('answers 404 elsewhere', async () => {
    server = await startHealthServer(0, {});
    expect((await fetch(url('/'))).status).toBe(404);
  });
});
