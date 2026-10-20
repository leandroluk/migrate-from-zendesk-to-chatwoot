import dotenv from 'dotenv';
import {z} from 'zod';

// Carrega as variáveis do arquivo .env
dotenv.config();

// @spec REQ-MIG-001
const envSchema = z.object({
  ZENDESK_SUBDOMAIN: z.string().min(1, 'O subdomínio do Zendesk é obrigatório.'),
  ZENDESK_EMAIL: z.string().email('O e-mail do Zendesk deve ser válido.'),
  ZENDESK_API_TOKEN: z.string().min(1, 'O token de API do Zendesk é obrigatório.'),

  CHATWOOT_BASE_URL: z
    .string()
    .url('A URL base do Chatwoot deve ser uma URL válida.')
    .default('https://app.chatwoot.com'),
  CHATWOOT_API_TOKEN: z.string().min(1, 'O token de acesso do Chatwoot é obrigatório.'),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().positive('O ID da conta do Chatwoot deve ser um número positivo.'),
  CHATWOOT_INBOX_ID: z.coerce.number().positive('O ID da caixa de entrada do Chatwoot deve ser positivo.'),

  MIGRATION_TICKET_ID: z
    .string()
    .default('*')
    .refine(val => {
      const trimmed = val.trim();
      if (trimmed === '*') return true;
      const parts = trimmed.split(',').map(p => p.trim());
      return parts.length > 0 && parts.every(p => /^\d+$/.test(p));
    }, 'MIGRATION_TICKET_ID deve ser "*" ou uma lista de IDs separados por vírgula (ex: "123,456,789").'),
  MIGRATION_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  MIGRATION_LOCALE: z.string().default('pt-BR'),
  MIGRATION_DRY_RUN: z
    .string()
    .optional()
    .transform(val => val === 'true' || val === '1')
    .pipe(z.boolean())
    .default(false),
});

// @spec REQ-MIG-001
export type AppConfig = z.infer<typeof envSchema>;

/**
 * Serviço responsável pelo carregamento e validação das variáveis de ambiente da aplicação.
 * Implementa o padrão Singleton para garantir uma única fonte da verdade de configuração.
 *
 * @spec REQ-MIG-001
 */
export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly config: AppConfig;

  /**
   * Construtor privado para inicialização e validação das configurações via Zod.
   */
  private constructor() {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errorDetails = result.error.issues.map(issue => ` - ${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(`[ConfigService] Falha na validação das variáveis de ambiente:\n${errorDetails}`);
    }

    this.config = result.data;
  }

  /**
   * Obtém a instância única do ConfigService.
   *
   * @returns Instância ativa do ConfigService.
   */
  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Retorna o objeto de configurações totalmente validado e tipado.
   *
   * @returns Objeto AppConfig com as configurações.
   */
  public get(): AppConfig {
    return this.config;
  }

  /**
   * Indica se a migração deve processar todos os chamados sem a tag chatwoot.
   *
   * @returns true se MIGRATION_TICKET_ID for '*'; false se houver lista delimitada de IDs.
   */
  public isAllTicketsMode(): boolean {
    return this.config.MIGRATION_TICKET_ID.trim() === '*';
  }

  /**
   * Indica se a migração está configurada para uma lista explícita de chamados delimitada por vírgula.
   *
   * @returns true se houver um ou mais IDs numéricos especificados.
   */
  public hasExplicitTicketList(): boolean {
    return !this.isAllTicketsMode();
  }

  /**
   * Retorna o array de IDs numéricos dos chamados caso uma lista delimitada tenha sido fornecida.
   *
   * @returns Array de IDs numéricos ou array vazio caso esteja configurado como '*'.
   */
  public getTargetTicketIds(): number[] {
    if (this.isAllTicketsMode()) {
      return [];
    }
    return this.config.MIGRATION_TICKET_ID.split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .map(item => parseInt(item, 10));
  }

  /**
   * Mantido para compatibilidade: indica se há lista explícita de IDs configurada.
   *
   * @returns true se não for '*', false caso contrário.
   */
  public isSingleTicketMode(): boolean {
    return this.hasExplicitTicketList();
  }

  /**
   * Mantido para compatibilidade: retorna o primeiro ID numérico ou null se for '*'.
   *
   * @returns Número do ID do primeiro chamado alvo ou null.
   */
  public getTargetTicketId(): number | null {
    const ids = this.getTargetTicketIds();
    return ids.length > 0 ? (ids[0] ?? null) : null;
  }
}
