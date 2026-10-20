# Directory Structure

```
.
├── .env.example              # Template for environment configuration
├── .gitignore                # Git ignore rules (node_modules, .env, .specs/.index)
├── package.json              # Project metadata, scripts and dependencies
├── tsconfig.json             # TypeScript compiler configuration
├── .specs/                   # Spec-driven context & graph index
│   ├── project/              # High-level project state, roadmap, specs
│   ├── codebase/             # System documentation & conventions
│   └── features/             # Feature specs & design documents
└── src/
    ├── index.ts              # CLI entrypoint
    ├── config/
    │   └── env.ts            # Environment variables loader & Zod validation
    ├── types/
    │   ├── zendesk.ts        # Zendesk API data types
    │   ├── chatwoot.ts       # Chatwoot API data types
    │   └── migration.ts      # Internal migration models
    ├── clients/
    │   ├── zendesk-client.ts # Zendesk REST API client
    │   └── chatwoot-client.ts# Chatwoot REST API client
    ├── mappers/
    │   └── ticket-mapper.ts  # Mapping logic from Zendesk models to Chatwoot models
    └── services/
        └── migration-service.ts # Orchestrator for migration workflow
```
