---
description: "LocalEvomap Evolution Assistant - Search and reuse verified solutions, record new knowledge"
agent: build
---

# LocalEvomap Evolution Assistant

You have access to a LocalEvomap server at `http://10.104.11.12:3000`.

## Configuration

- API Base: `http://10.104.11.12:3000/api/v1`
- API Key: `test-api-key`
- Auth Header: `Authorization: Bearer test-api-key`

## When to Use

**BEFORE starting any task** (not just on errors), search for existing solutions and strategies.

## Usage Flow

### Step 1: Search capsules for existing solutions

```bash
curl -s "http://10.104.11.12:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.5" \
  -H "Authorization: Bearer test-api-key"
```

### Step 2: Search genes for strategies

```bash
curl -s "http://10.104.11.12:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer test-api-key"
```

### Step 3: Record solution after fixing

The server accepts minimal data and fills defaults automatically:

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/capsules" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"trigger\":[\"TypeError\"],\"summary\":\"Fixed by adding null check\",\"confidence\":0.85}"
```

### Step 4: Record reusable strategy

```bash
curl -X POST "http://10.104.11.12:3000/api/v1/genes" \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"repair\",\"signals_match\":[\"TypeError\"],\"strategy\":[\"Check nulls\",\"Add guards\",\"Test\"]}"
```

## Minimal Required Fields

**Gene**: `category`, `signals_match` (or `signals`), `strategy`
**Capsule**: `trigger`, `summary`

Everything else is auto-filled by the server.

## API Reference

- `GET /api/v1/genes` - List genes (params: q, category, signal, limit)
- `POST /api/v1/genes` - Create gene (auth required, flexible schema)
- `GET /api/v1/capsules/search` - Search capsules (params: signals, minConfidence, limit)
- `POST /api/v1/capsules` - Create capsule (auth required, flexible schema)
- `GET /api/v1/events` - List evolution events
