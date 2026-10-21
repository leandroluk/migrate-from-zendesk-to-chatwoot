# Roadmap: Zendesk to Chatwoot Migration

## Phase 1: Tool Setup & Architecture (Current)

- [x] Base project configuration (TypeScript, oxlint, oxfmt, dotenv, zod)
- [x] Project specification & design via `graph-spec-design`
- [ ] Core configuration loader & validation with `MIGRATION_TICKET_ID_LIST` (`*` support)
- [ ] Zendesk API Client (ticket retrieval & comments fetch)
- [ ] Chatwoot API Client (contact sync, conversation creation, message creation)
- [ ] Migration orchestrator with single-ticket vs all-tickets loop

## Phase 2: Refinement & Resiliency

- [ ] Attachment migration / preservation
- [ ] Agent assignment mapping
- [ ] Pagination & rate limit backoff (exponential backoff / 429 handling)
- [ ] Migration report & failed tickets recovery log

## Phase 3: Production Readiness

- [ ] CLI flags override (`--ticket`, `--all`, `--dry-run`)
- [ ] State tracking database / local file (resume interrupted migrations)
