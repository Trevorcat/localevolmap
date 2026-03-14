import * as http from 'http';
import { MappingProxyError, type MappingProxyLike } from './mapping-proxy';

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

export async function handleUnifiedMappingRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  proxy: MappingProxyLike,
): Promise<boolean> {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/v1/mapping')) {
    return false;
  }

  try {
    if (req.method === 'GET' && pathname === '/api/v1/mapping/health') {
      writeJson(res, 200, await proxy.getStatus());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/v1/mapping/ingest/profiles') {
      const body = await readRequestBody(req);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body || '{}') as Record<string, unknown>;
      } catch (error) {
        writeJson(res, 400, { error: 'invalid_json_body', detail: (error as Error).message });
        return true;
      }
      writeJson(res, 200, await proxy.ingestProfiles(parsed));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/v1/mapping/query/candidates') {
      const body = await readRequestBody(req);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body || '{}') as Record<string, unknown>;
      } catch (error) {
        writeJson(res, 400, { error: 'invalid_json_body', detail: (error as Error).message });
        return true;
      }
      writeJson(res, 200, await proxy.queryCandidates(parsed));
      return true;
    }

    writeJson(res, 404, { error: 'mapping_endpoint_not_found' });
    return true;
  } catch (error) {
    if (error instanceof MappingProxyError) {
      writeJson(res, error.statusCode, { error: error.code, detail: error.message });
      return true;
    }
    throw error;
  }
}
