import {enUSDictionary} from './en-us';
import {ptBRDictionary} from './pt-br';
import type {MigrationDictionary} from './types';

/**
 * Serviço responsável por gerenciar e fornecer o dicionário ativo de textos e traduções
 * utilizado na geração de mensagens, notas e entidades migradas para o Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export class DictionaryService {
  private static instance: DictionaryService | null = null;
  private readonly activeDictionary: MigrationDictionary;
  private readonly dictionaries: Map<string, MigrationDictionary> = new Map();

  /**
   * Construtor que registra os dicionários suportados e define o dicionário ativo.
   *
   * @param locale Código do locale/dicionário desejado (ex: 'pt-BR', 'en-US').
   */
  private constructor(locale: string = 'pt-BR') {
    this.dictionaries.set('pt-br', ptBRDictionary);
    this.dictionaries.set('pt', ptBRDictionary);
    this.dictionaries.set('en-us', enUSDictionary);
    this.dictionaries.set('en', enUSDictionary);

    const normalizedLocale = locale.toLowerCase().trim();
    this.activeDictionary = this.dictionaries.get(normalizedLocale) ?? ptBRDictionary;
  }

  /**
   * Inicializa ou obtém a instância única do DictionaryService.
   *
   * @param locale Código opcional do locale para inicialização.
   * @returns Instância do DictionaryService.
   */
  public static getInstance(locale?: string): DictionaryService {
    if (!DictionaryService.instance) {
      DictionaryService.instance = new DictionaryService(locale);
    }
    return DictionaryService.instance;
  }

  /**
   * Retorna o dicionário de textos ativo da aplicação.
   *
   * @returns Dicionário contendo todas as chaves e templates de texto.
   */
  public get(): MigrationDictionary {
    return this.activeDictionary;
  }

  /**
   * Obtém o rótulo localizado para um papel nativo do Zendesk.
   *
   * @param role Papel base do usuário ('admin', 'agent', 'end-user').
   * @returns Rótulo traduzido correspondente.
   */
  public getRoleLabel(role: string): string {
    switch (role) {
      case 'admin':
        return this.activeDictionary.roles.admin;
      case 'agent':
        return this.activeDictionary.roles.agent;
      case 'end-user':
        return this.activeDictionary.roles.endUser;
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  /**
   * Obtém o rótulo traduzido para a prioridade do chamado.
   *
   * @param priority Prioridade do chamado no Zendesk ('urgent', 'high', 'normal', 'low').
   * @returns Rótulo traduzido.
   */
  public getPriorityLabel(priority?: string): string {
    switch (priority) {
      case 'urgent':
        return this.activeDictionary.priorities.urgent;
      case 'high':
        return this.activeDictionary.priorities.high;
      case 'normal':
        return this.activeDictionary.priorities.normal;
      case 'low':
        return this.activeDictionary.priorities.low;
      default:
        return this.activeDictionary.priorities.normal;
    }
  }

  /**
   * Obtém o rótulo traduzido para o status do chamado.
   *
   * @param status Status do chamado no Zendesk.
   * @returns Rótulo traduzido.
   */
  public getStatusLabel(status: string): string {
    const statuses = this.activeDictionary.statuses;
    switch (status) {
      case 'new':
        return statuses.new;
      case 'open':
        return statuses.open;
      case 'pending':
        return statuses.pending;
      case 'hold':
        return statuses.hold;
      case 'solved':
        return statuses.solved;
      case 'closed':
        return statuses.closed;
      default:
        return status;
    }
  }
}
