# State

Last synced commit: pending-initial-commit
**Last Updated:** 2026-10-20

## Current Work
Executing Phase 4 for Zendesk to Chatwoot Migration POC, starting with TASK-MIG-001 (ConfigService) and TASK-MIG-002 (TerminalUI).

## Todos
- [ ] TASK-MIG-001: Implementar ConfigService e validação Zod
- [ ] TASK-MIG-002: Implementar TerminalUI com Spinners, Barras de Progresso e Cores
- [ ] TASK-MIG-003: Criar Tipos e Interfaces para APIs Zendesk e Chatwoot
- [ ] TASK-MIG-004: Implementar ZendeskClient com Fetch Nativo e POO
- [ ] TASK-MIG-005: Implementar ChatwootClient com Fetch Nativo e POO
- [ ] TASK-MIG-006: Implementar PermissionService (Passo 1) e EdgeMigrationService (Passo 2)
- [ ] TASK-MIG-007: Implementar TicketMapper para Transformação de Chamados e Anexos
- [ ] TASK-MIG-008: Implementar MigrationOrchestrator e Entrypoint CLI (Passos 3, 4 e 5)

## Active Blockers
- none

## Recent Decisions (Last 15)
- [2026-10-20] Definido o fluxo de 5 passos: 1. Permissões, 2. Arestas (tags/grupos), 3. Checagem de ID seguro, 4. Loop sem tag 'chatwoot', 5. Extração com anexos, criação no Chatwoot e tag no Zendesk.
- [2026-10-20] Arquitetura orientada a objetos (POO) com classes especializadas e documentação JSDoc em português em todos os métodos.
- [2026-10-20] Feedback visual no terminal utilizando `ora` para spinners e `cli-progress` para barra de migração.
- [2026-10-20] Project setup with TypeScript, oxlint, oxfmt, dotenv, and zod.
- [2026-10-20] Requirement traceability enabled (`Traceability: on`) with `REQ-MIG-` identifiers.

## Recent Progress (Last 10)
- [2026-10-20] Especificação (spec.md), Desenho (design.md) e Tarefas (tasks.md) criados com rastreabilidade REQ/TASK.
- [2026-10-20] Dependências instaladas (typescript, oxlint, oxfmt, tsx, dotenv, zod, ora, cli-progress, picocolors).

## Lessons Learned (Last 5)
- [2026-10-20] Usar pnpm para todos os comandos no projeto, já que devEngines impõe pnpm em vez de npm.
- [2026-10-20] Native fetch do Node 26 simplifica a camada HTTP sem necessidade de Axios.

## Deferred Ideas
- Upload binário direto de anexos na API de attachments do Chatwoot caso o Chatwoot suporte upload direto em endpoint específico.
- Checkpoint em SQLite ou JSON local para retomadas em execuções de milhares de chamados.
