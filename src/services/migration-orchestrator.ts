import { ChatwootClient } from "../clients/chatwoot-client.js";
import { ZendeskClient } from "../clients/zendesk-client.js";
import { ConfigService } from "../config/env.js";
import { TicketMapper } from "../mappers/ticket-mapper.js";
import type { ZendeskTicket } from "../types/zendesk.js";
import type { MigrationSummaryStats } from "../ui/terminal-ui.js";
import { TerminalUI } from "../ui/terminal-ui.js";
import { EdgeMigrationService } from "./edge-migration-service.js";
import { PermissionService } from "./permission-service.js";

/**
 * Orquestrador principal da migração de chamados do Zendesk para o Chatwoot.
 * Coordena todos os 5 passos do fluxo:
 * 1. Autenticação e validação de permissões;
 * 2. Mensuração e migração de arestas (tags e grupos);
 * 3. Validação do modo seguro para chamado único por ID em produção;
 * 4. Loop paginado de busca para chamados sem a tag 'chatwoot';
 * 5. Extração completa, criação no Chatwoot, marcação de tag no Zendesk e exibição de progresso.
 *
 * @spec REQ-MIG-004
 * @spec REQ-MIG-005
 * @spec REQ-MIG-006
 * @spec REQ-MIG-007
 * @spec REQ-MIG-008
 */
export class MigrationOrchestrator {
  private readonly configService: ConfigService;
  private readonly zendeskClient: ZendeskClient;
  private readonly chatwootClient: ChatwootClient;
  private readonly permissionService: PermissionService;
  private readonly edgeMigrationService: EdgeMigrationService;
  private readonly ui: TerminalUI;

  /**
   * Construtor que inicializa todos os clientes e serviços dependentes.
   */
  public constructor() {
    this.configService = ConfigService.getInstance();
    const config = this.configService.get();

    this.zendeskClient = new ZendeskClient(config);
    this.chatwootClient = new ChatwootClient(config);
    this.permissionService = new PermissionService(this.zendeskClient, this.chatwootClient);
    this.edgeMigrationService = new EdgeMigrationService(this.zendeskClient, this.chatwootClient);
    this.ui = TerminalUI.getInstance();
  }

  /**
   * Ponto de entrada para disparar o fluxo de migração completo.
   *
   * @spec REQ-MIG-004
   * @spec REQ-MIG-005
   */
  public async run(): Promise<void> {
    const startTime = new Date();
    this.ui.printBanner();

    const config = this.configService.get();
    if (config.MIGRATION_DRY_RUN) {
      this.ui.logWarning(
        "MODO DRY-RUN ATIVADO: Nenhuma gravação real será feita no Chatwoot ou Zendesk.",
      );
    }

    // PASSO 1: Autenticação e Verificação de Permissões
    const permissionResult = await this.permissionService.validatePermissions();
    if (permissionResult.errors.length > 0) {
      this.ui.logError(
        "Migração abortada devido a inconsistências de permissão nas contas configuradas.",
      );
      return;
    }

    // PASSO 2: Mensuração e Migração de Arestas Pré-requisito
    const edgeAssessment = await this.edgeMigrationService.assessEdges();
    if (!config.MIGRATION_DRY_RUN) {
      await this.edgeMigrationService.migrateEdges(edgeAssessment);
    } else {
      this.ui.logInfo("[DRY-RUN] Criação de arestas no Chatwoot saltada.");
    }

    // PASSO 3 & 4: Execução por ID Seguro (Passo 3) ou Loop Contínuo (Passo 4)
    const stats: MigrationSummaryStats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startTime,
      endTime: new Date(),
    };

    if (this.configService.isSingleTicketMode()) {
      const targetId = this.configService.getTargetTicketId()!;
      await this.executeSingleTicketMode(targetId, stats);
    } else {
      await this.executeBatchLoopMode(stats);
    }

    stats.endTime = new Date();
    this.ui.printSummary(stats);
  }

  /**
   * Executa a migração no modo seguro de produção para um único chamado específico.
   *
   * @spec REQ-MIG-004
   * @param ticketId ID do chamado no Zendesk.
   * @param stats Estrutura mutável de estatísticas.
   */
  private async executeSingleTicketMode(
    ticketId: number,
    stats: MigrationSummaryStats,
  ): Promise<void> {
    this.ui.logInfo(`Modo Seguro ativado: Buscando chamado #${ticketId} no Zendesk...`);
    stats.total = 1;

    this.ui.startSpinner(`Validando existência do chamado #${ticketId} no Zendesk...`);
    const ticket = await this.zendeskClient.getTicket(ticketId);

    if (!ticket) {
      this.ui.failSpinner(`Chamado #${ticketId} NÃO foi localizado no Zendesk!`);
      this.ui.logError(
        `Operação interrompida por segurança: O chamado #${ticketId} informado no .env não existe no Zendesk.`,
      );
      stats.failed++;
      return;
    }

    this.ui.succeedSpinner(
      `Chamado #${ticketId} localizado com sucesso (Assunto: "${ticket.subject}").`,
    );

    const success = await this.processSingleTicket(ticket);
    if (success) {
      stats.success++;
    } else {
      stats.failed++;
    }
  }

  /**
   * Executa a migração em lote contínua, buscando chamados sem a tag 'chatwoot' até zerar a fila.
   *
   * @spec REQ-MIG-005
   * @param stats Estrutura mutável de estatísticas.
   */
  private async executeBatchLoopMode(stats: MigrationSummaryStats): Promise<void> {
    this.ui.logInfo("Modo Lote ativado: Buscando chamados pendentes (sem a tag 'chatwoot')...");

    let page = 1;
    let hasMore = true;

    // Busca preliminar para dimensionar o progresso
    const initialSearch = await this.zendeskClient.searchTicketsWithoutTag("chatwoot", 1);
    const totalPending = initialSearch.count;
    stats.total = totalPending;

    if (totalPending === 0) {
      this.ui.logSuccess(
        "Nenhum chamado pendente de migração encontrado! Fila com tag 'chatwoot' já zerada.",
      );
      return;
    }

    this.ui.logInfo(`Total de chamados identificados para migração: ${totalPending}`);
    this.ui.createProgressBar(totalPending, "Iniciando lote...");

    while (hasMore) {
      const searchResult = await this.zendeskClient.searchTicketsWithoutTag("chatwoot", page);
      const tickets = searchResult.results;

      if (!tickets || tickets.length === 0) {
        hasMore = false;
        break;
      }

      for (const ticket of tickets) {
        this.ui.updateProgressBar(stats.success + stats.failed, {
          status: `Ticket #${ticket.id}`,
        });

        const success = await this.processSingleTicket(ticket);
        if (success) {
          stats.success++;
        } else {
          stats.failed++;
        }

        this.ui.updateProgressBar(stats.success + stats.failed, {
          status: `Ticket #${ticket.id} concluído`,
        });
      }

      // Se marcamos os chamados com 'chatwoot', na próxima busca eles já não retornam na página 1
      // Porém, se estiver em dry-run ou para garantir avanço, incrementamos a página se não marcamos tags
      if (this.configService.get().MIGRATION_DRY_RUN) {
        page++;
        if (!searchResult.next_page) {
          hasMore = false;
        }
      }
    }

    this.ui.stopProgressBar();
    this.ui.logSuccess("Processamento do lote finalizado com sucesso.");
  }

  /**
   * Executa o Passo 5 completo para um chamado individual:
   * Extração de dados, contato, criação de conversa, mensagens, anexos e etiquetagem no Zendesk.
   *
   * @spec REQ-MIG-006
   * @spec REQ-MIG-007
   * @param ticket Chamado do Zendesk a ser migrado.
   * @returns true se migrado com sucesso; false em caso de falha.
   */
  private async processSingleTicket(ticket: ZendeskTicket): Promise<boolean> {
    const isDryRun = this.configService.get().MIGRATION_DRY_RUN;

    try {
      // 1. Obter requisitante no Zendesk
      const requester = await this.zendeskClient.getUser(ticket.requester_id);

      // 2. Obter comentários e anexos vinculados
      const comments = await this.zendeskClient.getTicketComments(ticket.id);

      if (isDryRun) {
        this.ui.logInfo(
          `[DRY-RUN] Simulado: Chamado #${ticket.id} ("${ticket.subject}") -> Requisitante: ${requester.email}, ${comments.length} comentários.`,
        );
        return true;
      }

      // 3. Localizar ou cadastrar o contato no Chatwoot
      let contact = await this.chatwootClient.findContactByEmail(requester.email);
      if (!contact) {
        contact = await this.chatwootClient.createContact({
          inbox_id: this.chatwootClient.getInboxId(),
          name: requester.name || requester.email.split("@")[0] || "Cliente",
          email: requester.email,
        });
      }

      // 4. Criar a conversa no Chatwoot
      const conversationStatus = TicketMapper.mapStatus(ticket.status);
      const conversation = await this.chatwootClient.createConversation({
        inbox_id: this.chatwootClient.getInboxId(),
        contact_id: contact.id,
        status: conversationStatus,
        custom_attributes: {
          zendesk_ticket_id: ticket.id,
          zendesk_original_status: ticket.status,
        },
      });

      // 5. Vincular tags/labels na conversa
      if (ticket.tags && ticket.tags.length > 0) {
        await this.chatwootClient.addLabelsToConversation(conversation.id, ticket.tags);
      }

      // 6. Mensagem inicial com descrição e metadados
      const initialMessageContent = TicketMapper.generateInitialConversationMessage(
        ticket,
        requester,
      );
      await this.chatwootClient.createMessage(conversation.id, {
        content: initialMessageContent,
        message_type: "incoming",
        private: false,
      });

      // 7. Replay cronológico de comentários e anexos
      for (const comment of comments) {
        const author = await this.zendeskClient.getUser(comment.author_id);
        const messageDto = TicketMapper.toChatwootMessageDTO(comment, author);
        await this.chatwootClient.createMessage(conversation.id, messageDto);
      }

      // 8. Ajustar status final caso necessário
      if (conversationStatus !== "open") {
        await this.chatwootClient.toggleStatus(conversation.id, conversationStatus);
      }

      // 9. Marcar chamado com a tag 'chatwoot' no Zendesk
      await this.zendeskClient.addTagToTicket(ticket.id, "chatwoot");

      return true;
    } catch (error) {
      this.ui.logError(`Falha ao processar chamado #${ticket.id}:`, error);
      return false;
    }
  }
}
