# Architecture

## High-Level Architecture

The migration POC follows a modular pipeline pattern:

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ Environment  │ ──> │  Migration   │ ──> │ Zendesk API   │ ──> │ Data Mapper/ │
│ Config (Zod) │     │ Orchestrator │     │    Client     │     │ Transformer  │
└──────────────┘     └──────────────┘     └───────────────┘     └──────────────┘
                            │                                          │
                            ▼                                          ▼
                     ┌──────────────┐                          ┌──────────────┐
                     │   Terminal   │ <─────────────────────── │ Chatwoot API │
                     │ Logger/Stats │                          │    Client    │
                     └──────────────┘                          └──────────────┘
```

## Layers

1. **Config Layer (`src/config/`)**:
   - Parses and validates environment variables via Zod schemas.
   - Interprets `MIGRATION_TICKET_ID`: either specific numeric ID (e.g. `"1234"`) or wildcard (`"*"`).

2. **Client Layer (`src/clients/`)**:
   - `ZendeskClient`: Authenticates via basic auth (`email/token:api_token`), handles ticket retrieval (`/api/v2/tickets/{id}.json` or paginated `/api/v2/tickets.json`), and fetches comments (`/api/v2/tickets/{id}/comments.json`).
   - `ChatwootClient`: Authenticates via `api_access_token`, manages contacts (`/api/v1/accounts/{id}/contacts`), conversations (`/api/v1/accounts/{id}/conversations`), and messages (`/api/v1/accounts/{id}/conversations/{id}/messages`).

3. **Domain / Mapping Layer (`src/mappers/`)**:
   - Maps Zendesk ticket status to Chatwoot conversation status:
     - `new` / `open` -> `open`
     - `pending` / `hold` -> `pending`
     - `solved` / `closed` -> `resolved`
   - Maps ticket comments into Chatwoot messages:
     - `public: true` -> outgoing/incoming message based on author role
     - `public: false` -> private note in Chatwoot

4. **Orchestrator Layer (`src/services/` & `src/index.ts`)**:
   - Coordinates the flow: fetches ticket -> ensures contact exists in Chatwoot -> creates conversation -> recreates comments in chronological order -> logs progress and metrics.
