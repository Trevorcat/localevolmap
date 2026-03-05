import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const corsOriginsRaw = process.env.CORS_ORIGINS || '*';
const corsOrigins = corsOriginsRaw.split(',').map((item) => item.trim()).filter(Boolean);

function resolveCorsOrigin(origin?: string): string {
    if (corsOrigins.includes('*')) return '*';
    if (origin && corsOrigins.includes(origin)) return origin;
    return corsOrigins[0] || 'null';
}

// Mock LocalEvomap state
let state = {
    genes: 0,
    capsules: 0,
    events: 0
};

let eventLog: Array<{time: string, msg: string}> = [];

function logEvent(msg: string) {
    state.events++;
    eventLog.unshift({
        time: new Date().toISOString(),
        msg
    });
    if (eventLog.length > 50) eventLog.pop();
}

const server = http.createServer((req, res) => {
    // CORS & Headers
    const reqOrigin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', resolveCorsOrigin(reqOrigin));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
        const filePath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // API Routes
    if (url.pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && url.pathname === '/api/stats') {
            res.writeHead(200);
            res.end(JSON.stringify(state));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/events') {
            res.writeHead(200);
            res.end(JSON.stringify(eventLog));
            return;
        }

        if (req.method === 'POST') {
            switch (url.pathname) {
                case '/api/reset':
                    state = { genes: 0, capsules: 0, events: 0 };
                    eventLog = [];
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'State reset' }));
                    return;

                case '/api/gene':
                    state.genes++;
                    logEvent(`Gene injected: G-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Gene added', state }));
                    return;

                case '/api/capsule':
                    state.capsules++;
                    logEvent(`Capsule spawned: CAP-${state.capsules}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Capsule added', state }));
                    return;

                case '/api/evolve':
                    if (state.genes === 0 || state.capsules === 0) {
                        logEvent('Evolution failed: Missing components');
                        res.writeHead(400);
                        res.end(JSON.stringify({ message: 'Needs both genes and capsules to evolve' }));
                        return;
                    }
                    state.genes = Math.max(0, state.genes - 1);
                    state.capsules = Math.max(0, state.capsules - 1);
                    logEvent('Evolution sequence triggered. Mutating DNA...');
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Evolution executed', state }));
                    return;

                default:
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Endpoint not found' }));
                    return;
            }
        }
    }

    // 404
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, HOST, () => {
    console.log(`LocalEvomap Core Server running at http://${HOST}:${PORT}`);
});
