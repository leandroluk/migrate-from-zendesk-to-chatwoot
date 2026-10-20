import dotenv from 'dotenv';
import {z} from 'zod';

// Carrega as variáveis do arquivo .env
dotenv.config();

/**
 * Validador da lista de IDs de chamados (suporta '*' ou lista delimitada por vírgula).
 */
const migrationTicketIdSchema = z
  .string()
  .default('*')
  .transform(val => val.trim())
  .refine(
    val => {
      if (val === '*') return true;
      const parts = val.split(',').map(p => p.trim());
      return parts.length > 0 && parts.every(p => /^\d+$/.test(p) && Number(p) > 0);
    },
    {
      message:
        'MIGRATION_TICKET_ID deve ser "*" (migrar todos) ou uma lista de IDs numéricos válidos separados por vírgula (ex: "101" ou "101,102,103").',
    }
  );

/**
 * Validador de booleano flexível (aceita 'true', 'false', '1', '0', etc.).
 */
const booleanCoerceSchema = z
  .preprocess(val => {
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return Boolean(val);
  }, z.boolean())
  .default(false);

const supportedLocales = ['pt-BR', 'en-US', 'pt', 'en'] as const;

// @spec REQ-MIG-001
const envSchema = z.object({
  ZENDESK_SUBDOMAIN: z
    .string()
    .trim()
    .min(1, 'O subdomínio do Zendesk (ZENDESK_SUBDOMAIN) é obrigatório.')
    .transform(val =>
      val
        .replace(/^https?:\/\//i, '')
        .replace(/\.zendesk\.com.*$/i, '')
        .replace(/\/+$/, '')
        .trim()
    )
    .pipe(
      z
        .string()
        .regex(
          /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
          'O subdomínio do Zendesk deve conter apenas letras, números e hífens (ex: "minhaempresa"). Não informe a URL inteira.'
        )
    ),
  ZENDESK_EMAIL: z
    .email('O e-mail do Zendesk (ZENDESK_EMAIL) deve ser um endereço de e-mail válido.')
    .trim()
    .min(1, 'O e-mail do Zendesk (ZENDESK_EMAIL) é obrigatório.'),
  ZENDESK_API_TOKEN: z
    .string()
    .trim()
    .min(6, 'O token de API do Zendesk (ZENDESK_API_TOKEN) deve ter pelo menos 6 caracteres.'),

  CHATWOOT_BASE_URL: z
    .string()
    .trim()
    .default('https://app.chatwoot.com')
    .transform(val => val.replace(/\/+$/, ''))
    .pipe(z.url('A URL base do Chatwoot (CHATWOOT_BASE_URL) deve ser uma URL válida com http:// ou https://.')),
  CHATWOOT_API_TOKEN: z.string().trim().min(6),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_INBOX_ID: z.coerce.number().int().positive(),

  MIGRATION_TICKET_ID: migrationTicketIdSchema,
  MIGRATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  MIGRATION_LOCALE: z.enum(supportedLocales).default('pt-BR'),
  MIGRATION_DRY_RUN: booleanCoerceSchema,
});

// @spec REQ-MIG-001
export type AppConfig = z.infer<typeof envSchema>;

/**
 * Serviço responsável pelo carregamento e validação estrita das variáveis de ambiente via Zod.
 * Implementa o padrão Singleton para garantir uma única fonte da verdade de configuração.
 *
 * @spec REQ-MIG-001
 */
export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly config: AppConfig;
  private readonly parsedTicketIds: number[];

  /**
   * Construtor privado para inicialização e validação das configurações via Zod.
   */
  private constructor() {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errorDetails = result.error.issues.map(issue => ` • ${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(
        `[ConfigService] Configurações inválidas ou incompletas no arquivo .env:\n${errorDetails}\n\nConsulte o arquivo README.md para obter instruções detalhadas de cada variável.`
      );
    }

    this.config = result.data;

    // Pré-computa os IDs caso não seja '*'
    if (this.config.MIGRATION_TICKET_ID === '*') {
      this.parsedTicketIds = [];
    } else {
      this.parsedTicketIds = this.config.MIGRATION_TICKET_ID.split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => parseInt(item, 10));
    }
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
    return this.config.MIGRATION_TICKET_ID === '*';
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
    return this.parsedTicketIds;
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
    return this.parsedTicketIds.length > 0 ? (this.parsedTicketIds[0] ?? null) : null;
  }
}
