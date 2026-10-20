# State

Last synced commit: d9a859e
**Last Updated:** 2026-10-20

## Current Work

Arquitetura da POC implementada com sucesso em TypeScript, POO, oxlint, oxfmt e terminal UI. Os 5 passos do fluxo foram implementados com validação Zod, modo seguro por ID, loop por tag 'chatwoot', mapeamento de arestas e anexos.

## Todos

- [ ] Executar primeiro teste prático em produção com 1 chamado via `MIGRATION_TICKET_ID=<id>`
- [ ] Implementar upload binário direto de anexos na API de attachments do Chatwoot (se necessário para a POC)
- [ ] Adicionar suporte a mapeamento de agentes Zendesk -> agentes Chatwoot

## Active Blockers

- none

## Recent Decisions (Last 15)

- [2026-10-20] Implementado DictionaryService com MIGRATION_LOCALE no .env (suporte a pt-BR, en-US) e integração dinâmica com a Custom Roles API do Zendesk para resolução real de papéis.
- [2026-10-20] Suporte a lista delimitada por vírgula em MIGRATION_TICKET_ID (ex: "123,456,789") permitindo loop sobre lista arbitrária de chamados ou lote total com "*".
- [2026-10-20] Atualizado tsconfig.json com moduleResolution "bundler", eliminadas extensões .js nos imports e adotado padrão de barrels (index.ts) em todos os módulos.
- [2026-10-20] Concluída implementação completa dos 8 componentes da POC de migração.
- [2026-10-20] Definido o fluxo de 5 passos: 1. Permissões, 2. Arestas (tags/grupos), 3. Checagem de ID seguro, 4. Loop sem tag 'chatwoot', 5. Extração com anexos, criação no Chatwoot e tag no Zendesk.
- [2026-10-20] Arquitetura orientada a objetos (POO) com classes especializadas e documentação JSDoc em português em todos os métodos.
- [2026-10-20] Feedback visual no terminal utilizando `ora` para spinners e `cli-progress` para barra de migração.
- [2026-10-20] Project setup with TypeScript, oxlint, oxfmt, dotenv, and zod.
- [2026-10-20] Requirement traceability enabled (`Traceability: on`) with `REQ-MIG-` identifiers.

## Recent Progress (Last 10)

- [2026-10-20] ticket-migration TASK-MIG-001 a TASK-MIG-008 concluídas com êxito. Gate: build (tsc), oxlint e oxfmt 100% aprovados. Commit a realizar. [REQ-MIG-001..REQ-MIG-009]
- [2026-10-20] Especificação (spec.md), Desenho (design.md) e Tarefas (tasks.md) criados com rastreabilidade REQ/TASK.
- [2026-10-20] Dependências instaladas (typescript, oxlint, oxfmt, tsx, dotenv, zod, ora, cli-progress, picocolors).

## Lessons Learned (Last 5)

- [2026-10-20] Oxc (oxlint e oxfmt) executam verificações em menos de 10ms, trazendo velocidade extrema para o ciclo de lint e formatação.
- [2026-10-20] Usar pnpm para todos os comandos no projeto, já que devEngines impõe pnpm em vez de npm.
- [2026-10-20] Native fetch do Node 26 simplifica a camada HTTP sem necessidade de Axios.

## Deferred Ideas

- Upload binário direto de anexos na API de attachments do Chatwoot caso o Chatwoot suporte upload direto em endpoint específico.
- Checkpoint em SQLite ou JSON local para retomadas em execuções de milhares de chamados.
