# Conventions

## Code Style

- Use ESM modules (`import` / `export`).
- Extensionless imports: Nunca utilizar `.js` no final dos imports de arquivos locais.
- Barrel files: Cada diretório (`clients`, `types`, `services`, `mappers`, `config`, `ui`) deve conter um `index.ts` reexportando suas entidades para permitir imports limpos.
- TypeScript strict mode enabled com `"moduleResolution": "bundler"`.
- Formatting handled by `oxfmt`.
- Linting handled by `oxlint`.
- File naming: kebab-case for files (`zendesk-client.ts`, `migration-orchestrator.ts`).
- Types/Classes: PascalCase (`ZendeskTicket`, `ChatwootConversation`).
- Functions/variables: camelCase (`migrateTicket`, `fetchComments`).

## Traceability

- When `Traceability: on` is active, functions and classes that implement requirements should be decorated with `// @spec REQ-XXX`.
- Commits must follow conventional commits with requirement references:
  `feat(migration): implement Zendesk client [REQ-MIG-002]`
  `fix(config): allow wildcard ticket id [REQ-MIG-001]`

## Error Handling

- Never throw unhandled rejections in loops.
- Catch errors per-ticket so a single failed ticket does not crash the migration of remaining tickets.
- Log failures with ticket ID and reason.
