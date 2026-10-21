import fs from 'node:fs';
import path from 'node:path';
import type {MigrationMappingEntry} from '../types';

/**
 * Serviço responsável por persistir e gerenciar o mapeamento "de-para"
 * entre chamados do Zendesk e suas respectivas conversas no Chatwoot.
 * Salva tanto em formato JSON estruturado quanto em CSV para facilitar auditoria e consulta humana.
 *
 * @spec REQ-MIG-011
 */
export class MappingService {
  private readonly jsonPath: string;
  private readonly csvPath: string;
  private cache: Map<number, MigrationMappingEntry>;

  /**
   * Construtor do MappingService.
   *
   * @param baseDir Diretório base onde os arquivos de mapeamento serão gravados (padrão: ./logs).
   */
  public constructor(baseDir?: string) {
    const dir = baseDir ?? path.resolve(process.cwd(), 'logs');
    this.jsonPath = path.join(dir, 'migration-mapping.json');
    this.csvPath = path.join(dir, 'migration-mapping.csv');
    this.cache = new Map<number, MigrationMappingEntry>();

    this.ensureDirectory();
    this.loadInitialMappings();
  }

  /**
   * Garante a existência do diretório de logs de mapeamento.
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.jsonPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
  }

  /**
   * Carrega os mapeamentos prévios do arquivo JSON para o cache em memória, se existir.
   */
  private loadInitialMappings(): void {
    if (!fs.existsSync(this.jsonPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.jsonPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, MigrationMappingEntry>;
      for (const [key, value] of Object.entries(data)) {
        this.cache.set(Number(key), value);
      }
    } catch {
      // Se houver falha na leitura, inicializa o cache vazio
      this.cache.clear();
    }
  }

  /**
   * Registra um novo mapeamento ou atualiza um existente de forma atômica no JSON e CSV.
   *
   * @param entry Registro contendo os IDs, URLs e metadados de migração.
   */
  public recordMapping(entry: MigrationMappingEntry): void {
    this.cache.set(entry.zendeskTicketId, entry);

    // 1. Atualizar arquivo JSON
    const jsonObject: Record<string, MigrationMappingEntry> = {};
    for (const [key, val] of this.cache.entries()) {
      jsonObject[String(key)] = val;
    }

    try {
      fs.writeFileSync(this.jsonPath, JSON.stringify(jsonObject, null, 2), 'utf-8');
    } catch (error) {
      console.error('[MappingService] Erro ao gravar migration-mapping.json:', error);
    }

    // 2. Atualizar ou acrescentar no arquivo CSV
    try {
      const csvExists = fs.existsSync(this.csvPath);
      let contentToWrite = '';

      if (!csvExists) {
        contentToWrite +=
          '"Zendesk Ticket ID","Chatwoot Conversation ID","Assunto","Requisitante","Anexos","URL Zendesk","URL Chatwoot","Data Migração"\n';
      }

      const escapeCsv = (str: string): string => `"${str.replace(/"/g, '""')}"`;
      const row = [
        entry.zendeskTicketId,
        entry.chatwootConversationId,
        escapeCsv(entry.subject),
        escapeCsv(entry.requesterEmail),
        entry.attachmentsCount,
        escapeCsv(entry.zendeskUrl),
        escapeCsv(entry.chatwootUrl),
        escapeCsv(entry.migratedAt),
      ].join(',');

      contentToWrite += `${row}\n`;
      fs.appendFileSync(this.csvPath, contentToWrite, 'utf-8');
    } catch (error) {
      console.error('[MappingService] Erro ao gravar migration-mapping.csv:', error);
    }
  }

  /**
   * Recupera o mapeamento de um chamado do Zendesk, se já migrado.
   *
   * @param zendeskTicketId ID do chamado no Zendesk.
   * @returns O registro de mapeamento correspondente ou undefined.
   */
  public getMapping(zendeskTicketId: number): MigrationMappingEntry | undefined {
    return this.cache.get(zendeskTicketId);
  }

  /**
   * Retorna todos os registros de mapeamento gravados até o momento.
   */
  public getAllMappings(): MigrationMappingEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Retorna os caminhos dos arquivos gravados.
   */
  public getFilePaths(): {jsonPath: string; csvPath: string} {
    return {
      jsonPath: this.jsonPath,
      csvPath: this.csvPath,
    };
  }
}
