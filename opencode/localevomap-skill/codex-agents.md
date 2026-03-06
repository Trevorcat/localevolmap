# LocalEvomap Evolution Assistant

This project integrates with a LocalEvomap evolution knowledge base server.

## Operational Policy

When encountering errors, bugs, or performance issues:

1. **ALWAYS search for existing solutions first** before writing a fix from scratch.
2. After successfully fixing an issue, **record the solution** for future reuse.

## Server

- API: `http://10.104.11.12:3000/api/v1`
- Auth: `Authorization: Bearer test-api-key`
- Dashboard: `http://10.104.11.12:3000`

## Commands

### Search for solutions (capsules)

```bash
curl -s "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.7" \
  -H "Authorization: Bearer test-api-key"
```

If `total > 0`, use the capsule's `summary` field as the fix strategy.

### Search for strategies (genes)

```bash
curl -s "http://10.104.11.12:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer test-api-key"
```

Use the gene's `strategy` array as step-by-step guidance.

### Record a new solution

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type":"Capsule","schema_version":"1.0.0","id":"capsule_TIMESTAMP","trigger":["SIGNAL"],"gene":"GENE_ID","summary":"FIX_DESCRIPTION","confidence":0.85,"blast_radius":{"files":1,"lines":5},"outcome":{"status":"success","score":0.9}}'
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/genes` | No | List genes |
| GET | `/api/v1/genes/:id` | No | Get gene |
| POST | `/api/v1/genes` | Yes | Create gene |
| PUT | `/api/v1/genes/:id` | Yes | Update gene |
| GET | `/api/v1/capsules/search` | No | Search capsules |
| GET | `/api/v1/capsules/:id` | No | Get capsule |
| POST | `/api/v1/capsules` | Yes | Create capsule |
| PUT | `/api/v1/capsules/:id` | Yes | Update capsule |
| GET | `/api/v1/events` | No | List events |

## Concepts

- **Genes**: Abstract knowledge patterns — how to respond to specific error signals
- **Capsules**: Concrete verified solutions — reusable across environments
- **Signals**: Error patterns extracted from runtime (TypeError, undefined, timeout, etc.)
