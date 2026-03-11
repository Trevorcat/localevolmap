import * as http from 'http';
import { AddressInfo } from 'net';
import { createHttpServer } from '../server';

function requestJson(port: number, method: string, pathname: string, body?: unknown): Promise<{ statusCode: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const serialized = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: serialized
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized) }
        : undefined,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode ?? 0,
          payload: text ? JSON.parse(text) : null,
        });
      });
    });

    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

describe('agent bootstrap endpoints', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = createHttpServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  test('serves the checked-in agent manifest', async () => {
    const response = await requestJson(port, 'GET', '/api/v1/agent-manifest');

    expect(response.statusCode).toBe(200);
    expect(response.payload.manifest_version).toBeTruthy();
    expect(response.payload.mcp.runtime.hash).toMatch(/^sha256-/);
    expect(response.payload.skills.cursor.download_url).toBe('/skill/cursor');
  });

  test('reports blocked when a breaking skill is outdated', async () => {
    const manifestResponse = await requestJson(port, 'GET', '/api/v1/agent-manifest');
    const manifest = manifestResponse.payload;

    const response = await requestJson(port, 'POST', '/api/v1/agent/check', {
      client: 'codex',
      manifest_version_seen: manifest.manifest_version,
      mcp_version: manifest.mcp.runtime.version,
      mcp_hash: manifest.mcp.runtime.hash,
      skill_version: '0.0.1',
      skill_hash: 'sha256-old',
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload.status).toBe('blocked');
    expect(response.payload.blocking).toBe(true);
  });
});
