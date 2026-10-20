# Tasks: Zendesk to Chatwoot Ticket Migration POC

### [x] TASK-MIG-001: Implementar ConfigService e validação Zod
- **REQ**: REQ-MIG-001
- **Symbols**: ConfigService
- **What**: Implementar classe singleton `ConfigService` que carrega `.env` e valida os dados de conexão do Zendesk, Chatwoot e a propriedade `MIGRATION_TICKET_ID` com suporte a `*` ou ID numérico.
- **Where**: `src/config/env.ts`
- **Depends on**: none
- **Done when**: O serviço carrega variáveis válidas e rejeita variáveis inválidas com mensagens legíveis.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-002: Implementar TerminalUI com Spinners, Barras de Progresso e Cores
- **REQ**: REQ-MIG-008
- **Symbols**: TerminalUI
- **What**: Implementar classe `TerminalUI` encapsulando `ora` para operações de espera, `cli-progress` para acompanhamento de tickets e `picocolors` para mensagens coloridas e banner visual.
- **Where**: `src/ui/terminal-ui.ts`
- **Depends on**: none
- **Done when**: Os métodos da classe formatam mensagens, spinners e barras de progresso sem erros de tipo.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-003: Criar Tipos e Interfaces para APIs Zendesk e Chatwoot
- **REQ**: REQ-MIG-002, REQ-MIG-003, REQ-MIG-006
- **Symbols**: ZendeskTicket, ZendeskComment, ZendeskUser, ChatwootContact, ChatwootConversation, ChatwootMessage
- **What**: Declarar interfaces tipadas para payloads de requisição e resposta das APIs oficiais do Zendesk e Chatwoot.
- **Where**: `src/types/zendesk.ts`, `src/types/chatwoot.ts`, `src/types/migration.ts`
- **Depends on**: none
- **Done when**: Arquivos de tipos compilam estritamente no TypeScript.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-004: Implementar ZendeskClient com Fetch Nativo e POO
- **REQ**: REQ-MIG-002, REQ-MIG-003, REQ-MIG-004, REQ-MIG-005, REQ-MIG-007
- **Symbols**: ZendeskClient
- **What**: Implementar classe `ZendeskClient` com autenticação basic auth, métodos para obter usuário atual, validar permissões, buscar chamado específico, buscar comentários, listar tags/grupos, buscar chamados sem tag `chatwoot` e adicionar tag `chatwoot` no chamado.
- **Where**: `src/clients/zendesk-client.ts`
- **Depends on**: TASK-MIG-001, TASK-MIG-003
- **Done when**: A classe compila, contém JSDocs em pt-BR e atende aos contratos de integração.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-005: Implementar ChatwootClient com Fetch Nativo e POO
- **REQ**: REQ-MIG-002, REQ-MIG-003, REQ-MIG-006
- **Symbols**: ChatwootClient
- **What**: Implementar classe `ChatwootClient` com autenticação via `api_access_token`, validação de permissão de admin, listagem e criação de labels, teams, busca e criação de contatos, criação de conversas e postagem de mensagens públicas ou privadas.
- **Where**: `src/clients/chatwoot-client.ts`
- **Depends on**: TASK-MIG-001, TASK-MIG-003
- **Done when**: A classe compila, contém JSDocs em pt-BR e métodos fortemente tipados.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-006: Implementar PermissionService (Passo 1) e EdgeMigrationService (Passo 2)
- **REQ**: REQ-MIG-002, REQ-MIG-003
- **Symbols**: PermissionService, EdgeMigrationService
- **What**: Implementar `PermissionService` para validar ativamente acesso em ambas plataformas, e `EdgeMigrationService` para mensurar e sincronizar dependências (tags -> labels, grupos -> teams).
- **Where**: `src/services/permission-service.ts`, `src/services/edge-migration-service.ts`
- **Depends on**: TASK-MIG-004, TASK-MIG-005
- **Done when**: Ambas classes compilam com JSDocs em pt-BR e integram com a UI para feedback em tempo real.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-007: Implementar TicketMapper para Transformação de Chamados e Anexos
- **REQ**: REQ-MIG-006
- **Symbols**: TicketMapper
- **What**: Implementar classe `TicketMapper` para converter status Zendesk para Chatwoot, formatar corpos de mensagens incluindo metadados originais de autoria, data e links/resumos de anexos.
- **Where**: `src/mappers/ticket-mapper.ts`
- **Depends on**: TASK-MIG-003
- **Done when**: Mapeamento de status e formatação de mensagens com anexos funcionam sem erros.
- **Gate**: `pnpm run build && pnpm run lint`

### [x] TASK-MIG-008: Implementar MigrationOrchestrator e Entrypoint CLI (Passos 3, 4 e 5)
- **REQ**: REQ-MIG-004, REQ-MIG-005, REQ-MIG-006, REQ-MIG-007, REQ-MIG-008, REQ-MIG-009
- **Symbols**: MigrationOrchestrator, main
- **What**: Integrar os 5 passos do fluxo: autenticação e permissões, mensuração e migração de arestas, modo seguro de 1 chamado por ID (com checagem de existência prévia), ou loop de busca contínua de chamados sem tag `chatwoot` com barra de progresso, criação no Chatwoot, etiquetagem no Zendesk e resumo final.
- **Where**: `src/services/migration-orchestrator.ts`, `src/index.ts`
- **Depends on**: TASK-MIG-001, TASK-MIG-002, TASK-MIG-004, TASK-MIG-005, TASK-MIG-006, TASK-MIG-007
- **Done when**: O projeto roda via `pnpm run dev`, compila no `pnpm run build`, e passa em `pnpm run lint` e `pnpm run format:check`.
- **Gate**: `pnpm run build && pnpm run lint && pnpm run format:check`
