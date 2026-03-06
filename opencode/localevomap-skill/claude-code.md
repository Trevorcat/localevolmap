# LocalEvomap Evolution Assistant

This project integrates with a LocalEvomap server for automatic solution search and knowledge reuse.

## Server Configuration

- **API Base URL**: http://10.104.11.12:3000/api/v1
- **API Key**: `test-api-key` (set via env `EVOMAP_API_KEY`)
- **Dashboard**: http://10.104.11.12:3000

## When to Use

**BEFORE starting any task**, search LocalEvomap for existing solutions and strategies. Don't wait for errors.

### Proactive Use (recommended)

- Starting a new feature → search genes for `category=feature` strategies
- Refactoring → search genes for `category=refactor`
- Performance work → search capsules with signals `performance,slow,optimize`
- Any task → search capsules for similar past solutions

### Reactive Use (on errors)

- Runtime errors (TypeError, ReferenceError, SyntaxError)
- Build/test failures
- Performance issues, timeouts

## Workflow

### 1. Search for Existing Solutions (Capsules)

```bash
curl -s "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.5" \
  -H "Authorization: Bearer test-api-key"
```

If `total > 0`, use the highest-confidence capsule's `summary` as the fix strategy.

### 2. Get Evolution Strategy (Genes)

```bash
curl -s "http://10.104.11.12:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer test-api-key"
```

Use the gene's `strategy` array as step-by-step guidance.

### 3. Record New Solutions

After fixing an issue, **always** record it. The server accepts flexible formats and fills defaults:

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"trigger\":[\"TypeError\",\"undefined\"],\"gene\":\"gene_repair\",\"summary\":\"Fixed by adding null check\",\"confidence\":0.85}"
```

Only `summary` and `trigger` are truly needed. The server auto-generates `id`, `type`, `schema_version`, `outcome`, `env_fingerprint`, `metadata`, and `blast_radius` if missing.

### 4. Record New Strategies (Genes)

Record a reusable strategy pattern:

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/genes" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"repair\",\"signals_match\":[\"TypeError\",\"undefined\"],\"strategy\":[\"Check for null/undefined values\",\"Add optional chaining\",\"Run tests\"]}"
```

Only `category`, `signals_match`, and `strategy` are truly needed. `signals` is accepted as alias for `signals_match`. Server auto-fills `id`, `type`, `preconditions`, `constraints`.

## Accepted Gene Schema

```json
{
  "type": "Gene",                          // optional, defaults to "Gene"
  "id": "gene_xxx",                        // optional, auto-generated
  "category": "repair",                    // repair|optimize|feature|security|performance|refactor|test
  "signals_match": ["error-pattern"],      // or use "signals" as alias
  "strategy": ["step 1", "step 2"],        // required
  "preconditions": [],                     // optional, defaults to []
  "constraints": {}                        // optional, defaults to {}
}
```

## Accepted Capsule Schema

```json
{
  "type": "Capsule",                       // optional, defaults to "Capsule"
  "schema_version": "1.0.0",              // optional, defaults to "1.0.0"
  "id": "cap_xxx",                         // optional, auto-generated
  "trigger": ["signal-1", "signal-2"],     // what errors/patterns trigger this
  "gene": "gene_xxx",                      // optional, defaults to "unknown"
  "summary": "What was fixed and how",     // required - the key knowledge
  "confidence": 0.85,                      // optional, defaults to 0.7
  "blast_radius": {"files": 1, "lines": 5}, // optional, defaults to {files:0,lines:0}
  "outcome": {"status": "success", "score": 0.9},  // optional, auto-filled
  "env_fingerprint": {"platform": "linux"} // optional, auto-filled
}
```

Note: `outcome` accepts both `{"status":"success","score":0.9}` and `{"success":true}` formats.

## API Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/genes` | List genes (params: `q`, `category`, `signal`, `limit`) |
| GET | `/api/v1/genes/:id` | Get gene by ID |
| POST | `/api/v1/genes` | Create gene (auth required, flexible schema) |
| PUT | `/api/v1/genes/:id` | Update gene (auth required) |
| GET | `/api/v1/capsules/search` | Search capsules (params: `signals`, `minConfidence`, `limit`) |
| GET | `/api/v1/capsules/:id` | Get capsule by ID |
| POST | `/api/v1/capsules` | Create capsule (auth required, flexible schema) |
| PUT | `/api/v1/capsules/:id` | Update capsule (auth required) |
| GET | `/api/v1/events` | List evolution events |

## Authentication

All write operations require Bearer token:
```
Authorization: Bearer test-api-key
```

## Core Concepts

- **Genes**: Abstract strategy patterns — "when you see X signals, try Y approach"
- **Capsules**: Concrete verified solutions — reusable fixes with confidence scores
- **Signals**: Patterns extracted from errors, logs, or user intent
- **Evolution Events**: Audit trail of all evolution operations
