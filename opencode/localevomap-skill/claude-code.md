# LocalEvomap Evolution Assistant

This project integrates with a LocalEvomap server for automatic solution search and knowledge reuse.

## Server Configuration

- **API Base URL**: http://10.104.11.12:3000/api/v1
- **API Key**: `test-api-key` (set via env `EVOMAP_API_KEY`)
- **Dashboard**: http://10.104.11.12:3000

## When to Use

When encountering errors, bugs, or performance issues during development, **always search LocalEvomap first** before writing a fix from scratch.

### Trigger Signals

Activate this skill when you see:
- Runtime errors (TypeError, ReferenceError, SyntaxError)
- Build failures
- Test failures
- Performance issues (slow, timeout)
- Security warnings

## Workflow

### 1. Search for Existing Solutions (Capsules)

When encountering an error, extract signals and search for matching capsules:

```bash
# Search capsules by error signals
curl -s "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.7" \
  -H "Authorization: Bearer test-api-key" | jq .
```

If `total > 0`, use the highest-confidence capsule's `summary` as the fix strategy.

### 2. Get Evolution Strategy (Genes)

If no capsules match, search for relevant genes:

```bash
# Search genes by category
curl -s "http://10.104.11.12:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer test-api-key" | jq .
```

Use the gene's `strategy` array as step-by-step fix guidance.

### 3. Record New Solutions

After successfully fixing an issue, record it as a new capsule:

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Capsule",
    "schema_version": "1.0.0",
    "id": "capsule_'$(date +%s)'",
    "trigger": ["TypeError", "undefined"],
    "gene": "gene_repair",
    "summary": "Description of the fix applied",
    "confidence": 0.85,
    "blast_radius": {"files": 1, "lines": 5},
    "outcome": {"status": "success", "score": 0.9}
  }'
```

## API Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/genes` | List genes (params: `q`, `category`, `signal`, `limit`) |
| GET | `/api/v1/genes/:id` | Get gene by ID |
| POST | `/api/v1/genes` | Create gene (auth required) |
| PUT | `/api/v1/genes/:id` | Update gene (auth required) |
| GET | `/api/v1/capsules/search` | Search capsules (params: `signals`, `minConfidence`, `limit`) |
| GET | `/api/v1/capsules/:id` | Get capsule by ID |
| POST | `/api/v1/capsules` | Create capsule (auth required) |
| PUT | `/api/v1/capsules/:id` | Update capsule (auth required) |
| GET | `/api/v1/events` | List evolution events |

## Authentication

All write operations require Bearer token:
```
Authorization: Bearer test-api-key
```

## Core Concepts

- **Genes**: Abstract knowledge patterns encoding "how to respond to specific signals"
- **Capsules**: Concrete, verified solutions that can be reused across environments
- **Signals**: Error patterns extracted from runtime logs
- **Evolution Events**: Audit trail of all evolution operations
