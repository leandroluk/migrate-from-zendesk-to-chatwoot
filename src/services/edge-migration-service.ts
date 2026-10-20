import {ChatwootClient, type ZendeskClient} from '../clients';
import type {EdgeAssessmentResult, EdgeMigrationResult} from '../types';
import {TerminalUI} from '../ui';

/**
 * Serviço responsável por executar o Passo 2 do fluxo:
 * Mensurar e verificar se todas as "arestas" pré-requisito (tags, grupos/equipes)
 * estão presentes no Chatwoot e realizar a criação prévia daquelas que estiverem ausentes.
 *
 * @spec REQ-MIG-003
 */
export class EdgeMigrationService {
  private readonly zendeskClient: ZendeskClient;
  private readonly chatwootClient: ChatwootClient;
  private readonly ui: TerminalUI;

  /**
   * Construtor do EdgeMigrationService.
   *
   * @param zendeskClient Cliente da API do Zendesk.
   * @param chatwootClient Cliente da API do Chatwoot.
   */
  public constructor(zendeskClient: ZendeskClient, chatwootClient: ChatwootClient) {
    this.zendeskClient = zendeskClient;
    this.chatwootClient = chatwootClient;
    this.ui = TerminalUI.getInstance();
  }

  /**
   * Mensura e compara as arestas (tags e grupos) entre o Zendesk e o Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Resultado do levantamento de arestas existentes e faltantes.
   */
  public async assessEdges(): Promise<EdgeAssessmentResult> {
    this.ui.startSpinner('Mensurando arestas pré-requisito (tags e grupos) no Zendesk e Chatwoot...');

    // 1. Obter tags, grupos e papéis personalizados do Zendesk
    const [zdTags, zdGroups, zdCustomRoles] = await Promise.all([
      this.zendeskClient.listTags(),
      this.zendeskClient.listGroups(),
      this.zendeskClient.listCustomRoles(),
    ]);

    // 2. Obter labels e teams do Chatwoot
    const [cwLabels, cwTeams] = await Promise.all([this.chatwootClient.listLabels(), this.chatwootClient.listTeams()]);

    const existingLabelTitles = new Set(cwLabels.map(l => l.title.toLowerCase()));
    const existingTeamNames = new Set(cwTeams.map(t => t.name.toLowerCase()));

    // Sanitiza e deduplica tags do Zendesk para o formato aceito pelo Chatwoot
    const sanitizedZdTags = zdTags
      .map(tag => ({
        ...tag,
        name: ChatwootClient.sanitizeLabel(tag.name),
      }))
      .filter(tag => tag.name.length > 0);

    const uniqueZdTags = Array.from(new Map(sanitizedZdTags.map(tag => [tag.name.toLowerCase(), tag])).values());

    // Filtra as arestas ausentes
    const missingTags = uniqueZdTags.filter(tag => !existingLabelTitles.has(tag.name.toLowerCase()));
    const missingGroups = zdGroups.filter(g => !existingTeamNames.has(g.name.toLowerCase()));

    const customRolesInfo =
      zdCustomRoles.length > 0 ? `, ${zdCustomRoles.length} papéis personalizados identificados.` : '.';

    this.ui.succeedSpinner(
      `Arestas mensuradas: ${zdTags.length} tags (${missingTags.length} ausentes no Chatwoot), ` +
        `${zdGroups.length} grupos (${missingGroups.length} ausentes no Chatwoot)${customRolesInfo}`
    );

    return {
      tags: missingTags,
      groups: missingGroups,
      missingLabelsCount: missingTags.length,
      missingTeamsCount: missingGroups.length,
    };
  }

  /**
   * Realiza a migração/criação das arestas que não existirem no Chatwoot.
   *
   * @spec REQ-MIG-003
   * @param assessment Dados apurados previamente no método assessEdges.
   * @returns Quantidade de labels e equipes criadas com êxito.
   */
  public async migrateEdges(assessment: EdgeAssessmentResult): Promise<EdgeMigrationResult> {
    if (assessment.missingLabelsCount === 0 && assessment.missingTeamsCount === 0) {
      this.ui.logInfo('Todas as arestas (tags e equipes) já estão sincronizadas no Chatwoot.');
      return {labelsCreated: 0, teamsCreated: 0};
    }

    this.ui.startSpinner('Sincronizando arestas faltantes no Chatwoot...');
    let labelsCreated = 0;
    let teamsCreated = 0;

    // Cria as labels faltantes
    for (const tag of assessment.tags) {
      try {
        await this.chatwootClient.createLabel(tag.name);
        labelsCreated++;
      } catch (err) {
        this.ui.logWarning(`Não foi possível criar a label '${tag.name}' no Chatwoot: ${String(err)}`);
      }
    }

    // Cria as equipes faltantes
    for (const group of assessment.groups) {
      try {
        await this.chatwootClient.createTeam(group.name, group.description);
        teamsCreated++;
      } catch (err) {
        this.ui.logWarning(`Não foi possível criar a equipe '${group.name}' no Chatwoot: ${String(err)}`);
      }
    }

    this.ui.succeedSpinner(
      `Arestas migradas no Chatwoot com sucesso: ${labelsCreated} labels e ${teamsCreated} equipes criadas.`
    );

    return {labelsCreated, teamsCreated};
  }
}
