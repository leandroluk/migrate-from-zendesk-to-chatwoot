import {ChatwootClient, type ZendeskClient} from '../clients';
import type {EdgeAssessmentResult, EdgeMigrationResult, ZendeskTicketField} from '../types';
import {TerminalUI} from '../ui';

/**
 * Serviço responsável por executar o Passo 2 do fluxo:
 * Mensurar e verificar se todas as "arestas" pré-requisito (tags, grupos/equipes e atributos personalizados)
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
   * Normaliza um título de campo para snake_case seguro para uso como attribute_key no Chatwoot.
   */
  public static normalizeKey(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Converte o tipo do campo do Zendesk para o display_type correspondente aceito pelo Chatwoot.
   */
  public static mapDisplayType(type: string): 'text' | 'number' | 'checkbox' | 'date' {
    switch (type) {
      case 'integer':
      case 'decimal':
        return 'number';
      case 'checkbox':
        return 'checkbox';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  }

  /**
   * Mensura e compara as arestas (tags, grupos e atributos personalizados) entre o Zendesk e o Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Resultado do levantamento de arestas existentes e faltantes.
   */
  public async assessEdges(): Promise<EdgeAssessmentResult> {
    this.ui.startSpinner('Mensurando arestas pré-requisito (tags, grupos e atributos personalizados)...');

    // 1. Obter tags, grupos, papéis e campos personalizados do Zendesk
    const [zdTags, zdGroups, zdCustomRoles, zdTicketFields] = await Promise.all([
      this.zendeskClient.listTags(),
      this.zendeskClient.listGroups(),
      this.zendeskClient.listCustomRoles(),
      this.zendeskClient.listTicketFields(),
    ]);

    // 2. Obter labels, teams e atributos personalizados do Chatwoot
    const [cwLabels, cwTeams, cwCustomAttrs] = await Promise.all([
      this.chatwootClient.listLabels(),
      this.chatwootClient.listTeams(),
      this.chatwootClient.listCustomAttributeDefinitions('conversation_attribute'),
    ]);

    const existingLabelTitles = new Set(cwLabels.map(l => l.title.toLowerCase()));
    const existingTeamNames = new Set(cwTeams.map(t => t.name.toLowerCase()));

    // Indexa atributos do Chatwoot por nome amigável e por chave para cruzamento resiliente
    const existingAttrByName = new Map<string, string>();
    const existingAttrByKey = new Map<string, string>();

    for (const def of cwCustomAttrs) {
      existingAttrByName.set(def.attribute_display_name.trim().toLowerCase(), def.attribute_key);
      existingAttrByKey.set(def.attribute_key.trim().toLowerCase(), def.attribute_key);
    }

    // Filtra apenas campos customizados ativos do Zendesk (ignora campos nativos de sistema)
    const systemTypes = ['subject', 'description', 'status', 'tickettype', 'priority', 'group', 'assignee'];
    const activeCustomFields = zdTicketFields.filter(f => !systemTypes.includes(f.type) && f.active);

    const fieldIdToChatwootKey = new Map<number, string>();
    const fieldsMap = new Map<number, ZendeskTicketField>();
    const missingAttributes: ZendeskTicketField[] = [];

    for (const field of activeCustomFields) {
      fieldsMap.set(field.id, field);
      const normalizedTitle = field.title.trim().toLowerCase();
      const generatedKey = EdgeMigrationService.normalizeKey(field.title);
      const matchedKey = existingAttrByName.get(normalizedTitle) ?? existingAttrByKey.get(generatedKey);

      if (matchedKey) {
        fieldIdToChatwootKey.set(field.id, matchedKey);
      } else {
        missingAttributes.push(field);
      }
    }

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

    this.ui.doneSpinner(
      `Arestas mensuradas: ${zdTags.length} tags (${missingTags.length} ausentes no Chatwoot), ` +
        `${zdGroups.length} grupos (${missingGroups.length} ausentes no Chatwoot), ` +
        `${activeCustomFields.length} atributos personalizados (${missingAttributes.length} ausentes no Chatwoot)${customRolesInfo}`
    );

    return {
      tags: missingTags,
      groups: missingGroups,
      customAttributes: missingAttributes,
      fieldIdToChatwootKey,
      fieldsMap,
      missingLabelsCount: missingTags.length,
      missingTeamsCount: missingGroups.length,
      missingAttributesCount: missingAttributes.length,
    };
  }

  /**
   * Realiza a migração/criação das arestas que não existirem no Chatwoot.
   *
   * @spec REQ-MIG-003
   * @param assessment Dados apurados previamente no método assessEdges.
   * @returns Quantidade de labels, equipes e atributos criados com êxito.
   */
  public async migrateEdges(assessment: EdgeAssessmentResult): Promise<EdgeMigrationResult> {
    const hasPendingEdges =
      assessment.missingLabelsCount > 0 || assessment.missingTeamsCount > 0 || assessment.missingAttributesCount > 0;

    if (!hasPendingEdges) {
      this.ui.logInfo(
        'Todas as arestas (tags, equipes e atributos personalizados) já estão sincronizadas no Chatwoot.'
      );
      return {
        labelsCreated: 0,
        teamsCreated: 0,
        attributesCreated: 0,
        fieldIdToChatwootKey: assessment.fieldIdToChatwootKey,
        fieldsMap: assessment.fieldsMap,
      };
    }

    this.ui.startSpinner('Sincronizando arestas faltantes no Chatwoot...');
    let labelsCreated = 0;
    let teamsCreated = 0;
    let attributesCreated = 0;

    // 1. Cria as labels faltantes
    for (const tag of assessment.tags) {
      try {
        await this.chatwootClient.createLabel(tag.name);
        labelsCreated++;
      } catch (err) {
        this.ui.logWarn(`Não foi possível criar a label '${tag.name}' no Chatwoot: ${String(err)}`);
      }
    }

    // 2. Cria as equipes faltantes
    for (const group of assessment.groups) {
      try {
        await this.chatwootClient.createTeam(group.name, group.description);
        teamsCreated++;
      } catch (err) {
        this.ui.logWarn(`Não foi possível criar a equipe '${group.name}' no Chatwoot: ${String(err)}`);
      }
    }

    // 3. Cria as definições de atributos personalizados faltantes
    for (const field of assessment.customAttributes) {
      try {
        const generatedKey = EdgeMigrationService.normalizeKey(field.title);
        const displayType = EdgeMigrationService.mapDisplayType(field.type);
        const created = await this.chatwootClient.createCustomAttributeDefinition({
          attribute_display_name: field.title,
          attribute_display_type: displayType,
          attribute_description: field.description || field.title,
          attribute_key: generatedKey,
          attribute_model: 'conversation_attribute',
        });
        assessment.fieldIdToChatwootKey.set(field.id, created.attribute_key);
        attributesCreated++;
      } catch (err) {
        this.ui.logWarn(`Não foi possível criar o atributo personalizado '${field.title}' no Chatwoot: ${String(err)}`);
      }
    }

    this.ui.doneSpinner(
      `Arestas migradas no Chatwoot com sucesso: ${labelsCreated} labels, ${teamsCreated} equipes e ${attributesCreated} atributos criados.`
    );

    return {
      labelsCreated,
      teamsCreated,
      attributesCreated,
      fieldIdToChatwootKey: assessment.fieldIdToChatwootKey,
      fieldsMap: assessment.fieldsMap,
    };
  }
}
