import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync, type StatementSync} from 'node:sqlite';
import type {MigrationMappingEntry} from '../types';

/**
 * Serviço responsável por persistir e gerenciar o mapeamento "de-para"
 * entre chamados do Zendesk e suas respectivas conversas no Chatwoot.
 * Utiliza SQLite nativo (node:sqlite) para operações atômicas, ultrarrápidas em O(1),
 * livres de gargalo de I/O em larga escala, e gera um CSV complementar para conferência humana.
 *
 * @spec REQ-MIG-011
 */
export class MappingService {
  private readonly dbPath: string;
  private readonly csvPath: string;
  private readonly db: DatabaseSync;
  private readonly insertStmt: StatementSync;
  private readonly selectStmt: StatementSync;
  private readonly countStmt: StatementSync;
  private readonly migratedSet: Set<number>;

  /**
   * Construtor do MappingService.
   *
   * @param baseDir Diretório base onde os arquivos de banco e CSV serão gravados (padrão: ./logs).
   */
  public constructor(baseDir?: string) {
    const dir = baseDir ?? path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }

    this.dbPath = path.join(dir, 'migration.db');
    this.csvPath = path.join(dir, 'migration-mapping.csv');
    this.migratedSet = new Set<number>();

    // Inicialização do SQLite nativo com modo WAL para máxima performance e concorrência
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migration_mappings (
        zendesk_ticket_id INTEGER PRIMARY KEY,
        chatwoot_conversation_id INTEGER NOT NULL,
        subject TEXT,
        requester_email TEXT,
        attachments_count INTEGER DEFAULT 0,
        zendesk_url TEXT,
        chatwoot_url TEXT,
        migrated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chatwoot_conv ON migration_mappings(chatwoot_conversation_id);
    `);

    // Prepared statements para máxima velocidade de execução
    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO migration_mappings (
        zendesk_ticket_id,
        chatwoot_conversation_id,
        subject,
        requester_email,
        attachments_count,
        zendesk_url,
        chatwoot_url,
        migrated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectStmt = this.db.prepare('SELECT * FROM migration_mappings WHERE zendesk_ticket_id = ? LIMIT 1');

    this.countStmt = this.db.prepare('SELECT COUNT(*) as count FROM migration_mappings');

    // Migra registros de migration-mapping.json legado, se existir
    this.importLegacyJsonIfNeeded(dir);

    // Carrega todos os IDs já migrados para o Set em memória (sub-microssegundo)
    this.loadMigratedSet();
  }

  /**
   * Importa registros do arquivo migration-mapping.json legado caso ainda exista.
   */
  private importLegacyJsonIfNeeded(dir: string): void {
    const legacyJsonPath = path.join(dir, 'migration-mapping.json');
    if (!fs.existsSync(legacyJsonPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(legacyJsonPath, 'utf-8');
      if (content.trim()) {
        const data = JSON.parse(content) as Record<string, MigrationMappingEntry>;
        for (const entry of Object.values(data)) {
          this.insertStmt.run(
            entry.zendeskTicketId,
            entry.chatwootConversationId,
            entry.subject ?? '',
            entry.requesterEmail ?? '',
            entry.attachmentsCount ?? 0,
            entry.zendeskUrl ?? '',
            entry.chatwootUrl ?? '',
            entry.migratedAt ?? new Date().toISOString()
          );
        }
      }
      // Renomeia o JSON legado para .bak para não ser reprocessado nem causar confusão
      fs.renameSync(legacyJsonPath, path.join(dir, 'migration-mapping.json.bak'));
    } catch {
      // Ignora falha de importação legada
    }
  }

  /**
   * Preenche o Set de IDs migrados em memória para consultas O(1) instantâneas.
   */
  private loadMigratedSet(): void {
    try {
      const rows = this.db.prepare('SELECT zendesk_ticket_id FROM migration_mappings').all() as Array<{
        zendesk_ticket_id: number;
      }>;

      for (const row of rows) {
        this.migratedSet.add(Number(row.zendesk_ticket_id));
      }
    } catch {
      // Falha silenciosa
    }
  }

  /**
   * Registra um novo mapeamento de-para de forma atômica no SQLite e acrescenta linha no CSV.
   *
   * @param entry Registro contendo os IDs, URLs e metadados de migração.
   */
  public recordMapping(entry: MigrationMappingEntry): void {
    const ticketId = Number(entry.zendeskTicketId);
    this.migratedSet.add(ticketId);

    // 1. Gravação no SQLite
    try {
      this.insertStmt.run(
        ticketId,
        Number(entry.chatwootConversationId),
        String(entry.subject ?? ''),
        String(entry.requesterEmail ?? ''),
        Number(entry.attachmentsCount ?? 0),
        String(entry.zendeskUrl ?? ''),
        String(entry.chatwootUrl ?? ''),
        String(entry.migratedAt ?? new Date().toISOString())
      );
    } catch (error) {
      console.error('[MappingService] Erro ao gravar no SQLite:', error);
    }

    // 2. Gravação de linha adicional no CSV para verificação humana
    try {
      const csvExists = fs.existsSync(this.csvPath);
      let contentToWrite = '';

      if (!csvExists) {
        contentToWrite +=
          '"Zendesk Ticket ID","Chatwoot Conversation ID","Assunto","Requisitante","Anexos","URL Zendesk","URL Chatwoot","Data Migração"\n';
      }

      const escapeCsv = (val: unknown): string => {
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const row = [
        entry.zendeskTicketId,
        entry.chatwootConversationId,
        escapeCsv(entry.subject),
        escapeCsv(entry.requesterEmail),
        entry.attachmentsCount ?? 0,
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
   * Verifica se um chamado do Zendesk já foi migrado em O(1) sem I/O de disco.
   *
   * @param zendeskTicketId ID do chamado no Zendesk.
   * @returns Verdadeiro caso o chamado já conste no banco/mapeamento.
   */
  public isMigrated(zendeskTicketId: number): boolean {
    return this.migratedSet.has(Number(zendeskTicketId));
  }

  /**
   * Recupera o mapeamento completo de um chamado do Zendesk a partir do SQLite.
   *
   * @param zendeskTicketId ID do chamado no Zendesk.
   * @returns O registro de mapeamento correspondente ou undefined.
   */
  public getMapping(zendeskTicketId: number): MigrationMappingEntry | undefined {
    const row = this.selectStmt.get(Number(zendeskTicketId)) as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }

    return {
      zendeskTicketId: Number(row.zendesk_ticket_id),
      chatwootConversationId: Number(row.chatwoot_conversation_id),
      subject: String(row.subject ?? ''),
      requesterEmail: String(row.requester_email ?? ''),
      attachmentsCount: Number(row.attachments_count ?? 0),
      zendeskUrl: String(row.zendesk_url ?? ''),
      chatwootUrl: String(row.chatwoot_url ?? ''),
      migratedAt: String(row.migrated_at ?? ''),
    };
  }

  /**
   * Retorna a quantidade total de chamados mapeados no banco.
   */
  public getMigratedCount(): number {
    const row = this.countStmt.get() as {count: number} | undefined;
    return row?.count ?? this.migratedSet.size;
  }

  /**
   * Retorna os caminhos dos arquivos de banco e CSV.
   */
  public getFilePaths(): {dbPath: string; csvPath: string} {
    return {
      dbPath: this.dbPath,
      csvPath: this.csvPath,
    };
  }

  /**
   * Fecha a conexão com o SQLite de forma segura.
   */
  public close(): void {
    try {
      this.db.close();
    } catch {
      // Ignora erro ao fechar
    }
  }
}
