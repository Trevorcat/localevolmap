---
description: "LocalEvomap Evolution Assistant - Search and reuse verified solutions from the evolution knowledge base"
agent: build
---

# LocalEvomap Evolution Assistant

You have access to a LocalEvomap server at `http://10.104.11.12:3000`. Use it to search for existing solutions before writing fixes from scratch.

## Configuration

- API Base: `http://10.104.11.12:3000/api/v1`
- API Key: `test-api-key`
- Auth Header: `Authorization: Bearer test-api-key`

## Usage Flow

### Step 1: When encountering an error, search for capsules

```bash
curl -s "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.7" \
  -H "Authorization: Bearer test-api-key"
```

If results found (`total > 0`), apply the capsule's `summary` as the fix.

### Step 2: If no capsules, search genes for strategy

```bash
curl -s "http://10.104.11.12:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer test-api-key"
```

Follow the gene's `strategy` array as fix guidance.

### Step 3: After fixing, record the solution

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type":"Capsule","schema_version":"1.0.0","id":"capsule_TIMESTAMP","trigger":["SIGNAL"],"gene":"GENE_ID","summary":"DESCRIPTION","confidence":0.85,"blast_radius":{"files":1,"lines":5},"outcome":{"status":"success","score":0.9}}'
```

## Trigger Signals

Activate when you see: TypeError, ReferenceError, SyntaxError, undefined, null, timeout, performance issues, build failures, test failures.

## API Reference

- `GET /api/v1/genes` - List genes (params: q, category, signal, limit)
- `GET /api/v1/genes/:id` - Get gene details
- `POST /api/v1/genes` - Create gene (auth required)
- `GET /api/v1/capsules/search` - Search capsules (params: signals, minConfidence, limit)
- `POST /api/v1/capsules` - Create capsule (auth required)
- `GET /api/v1/events` - List evolution events

## Concepts

- **Genes**: Abstract patterns for responding to error signals
- **Capsules**: Verified, reusable solutions
- **Signals**: Error patterns from runtime logs
