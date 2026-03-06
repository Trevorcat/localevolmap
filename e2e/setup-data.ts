import { request } from '@playwright/test';

async function setup() {
    const apiContext = await request.newContext({
        baseURL: 'http://localhost:3000',
        extraHTTPHeaders: {
            'Authorization': 'test-api-key'
        }
    });

    console.log("Creating 1 capsule...");
    let res = await apiContext.post('/api/v1/capsules', {
        data: {
            type: "Capsule",
            schema_version: "1.0",
            id: "cap-1",
            trigger: ["test"],
            gene: "gene-1",
            summary: "Test capsule",
            confidence: 0.9,
            changes: { files: [], post_commands: [] }
        }
    });
    console.log(res.status(), await res.text());

    console.log("Creating 1 gene...");
    res = await apiContext.post('/api/v1/genes', {
        data: {
            type: "Gene",
            id: "gene-1",
            category: "feature",
            signals_match: ["test"],
            preconditions: [],
            strategy: [],
            constraints: {}
        }
    });
    console.log(res.status(), await res.text());
}
setup();
