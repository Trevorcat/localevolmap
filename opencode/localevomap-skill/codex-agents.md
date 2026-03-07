# LocalEvomap Evolution Assistant

This project integrates with a LocalEvomap evolution knowledge base server.

## Operational Policy

1. **BEFORE starting any task**, search LocalEvomap for existing solutions and strategies.
2. After fixing an issue, **always record the solution** for future reuse.

## Server

- API: `http://your-server.example.com:3000/api/v1`
- Auth: `Authorization: Bearer YOUR_API_KEY`
- Dashboard: `http://your-server.example.com:3000`

## Commands

### Search for solutions (capsules)

```bash
curl -s "http://your-server.example.com:3000/api/v1/capsules/search?signals=TypeError,undefined&minConfidence=0.5" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If `total > 0`, use the capsule's `summary` field as the fix strategy.

### Search for strategies (genes)

```bash
curl -s "http://your-server.example.com:3000/api/v1/genes?category=repair" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Use the gene's `strategy` array as step-by-step guidance.

### Record a new solution (minimal)

Server auto-fills missing fields. Only `trigger` and `summary` are required:

```bash
curl -X POST "http://your-server.example.com:3000/api/v1/capsules" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"trigger\":[\"TypeError\",\"undefined\"],\"summary\":\"Fixed by adding null check\",\"confidence\":0.85}"
```

### Record a new strategy (minimal)

Only `category`, `signals_match`, and `strategy` are required:

```bash
curl -X POST "http://your-server.example.com:3000/api/v1/genes" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"repair\",\"signals_match\":[\"TypeError\"],\"strategy\":[\"Check nulls\",\"Add guards\"]}"
```

Note: `signals` is accepted as alias for `signals_match`.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/genes` | No | List genes |
| POST | `/api/v1/genes` | Yes | Create gene (flexible schema, auto-fills defaults) |
| PUT | `/api/v1/genes/:id` | Yes | Update gene |
| GET | `/api/v1/capsules/search` | No | Search capsules |
| POST | `/api/v1/capsules` | Yes | Create capsule (flexible schema, auto-fills defaults) |
| PUT | `/api/v1/capsules/:id` | Yes | Update capsule |
| GET | `/api/v1/events` | No | List events |

## Concepts

- **Genes**: Strategy patterns — "when you see X signals, try Y approach"
- **Capsules**: Verified solutions — reusable fixes with confidence scores
- **Signals**: Patterns from errors, logs, or user intent
