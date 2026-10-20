import dotenv from 'dotenv';
import {z} from 'zod';

dotenv.config();

// @spec REQ-MIG-001
const appConfig = z.object({
  ZENDESK_BASE_URL: z.url(),
  ZENDESK_EMAIL: z.email(),
  ZENDESK_API_TOKEN: z.string().min(1),

  CHATWOOT_BASE_URL: z.url().default('https://app.chatwoot.com'),
  CHATWOOT_API_TOKEN: z.string().min(1),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_INBOX_ID: z.coerce.number().int().positive(),

  MIGRATION_TICKET_ID: z.string().default('*'),
  MIGRATION_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  MIGRATION_LOCALE: z.string().default('pt-BR'),
  MIGRATION_DRY_RUN: z.coerce.boolean().default(false),
});

// @spec REQ-MIG-001
export type AppConfig = z.infer<typeof appConfig>;

/**
 * Serviço responsável pelo carregamento e validação das variáveis de ambiente via Zod.
 *
 * @spec REQ-MIG-001
 */
export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly config: AppConfig;
  private readonly parsedTicketIds: number[];

  private constructor() {
    // Suporta ZENDESK_BASE_URL diretamente ou retrocompatibilidade com ZENDESK_SUBDOMAIN
    const envSource = {
      ...process.env,
      ZENDESK_BASE_URL:
        process.env.ZENDESK_BASE_URL ||
        (process.env.ZENDESK_SUBDOMAIN
          ? `https://${process.env.ZENDESK_SUBDOMAIN.replace(/^https?:\/\//i, '').replace(/\.zendesk\.com.*$/i, '')}.zendesk.com`
          : undefined),
    };

    const result = appConfig.safeParse(envSource);

    if (!result.success) {
      const errorDetails = result.error.issues.map(issue => ` • ${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(`[ConfigService] Invalid environment configuration:\n${errorDetails}`);
    }

    this.config = result.data;

    if (this.config.MIGRATION_TICKET_ID === '*') {
      this.parsedTicketIds = [];
    } else {
      this.parsedTicketIds = this.config.MIGRATION_TICKET_ID.split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => parseInt(item, 10));
    }
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get(): AppConfig {
    return this.config;
  }

  public isAllTicketsMode(): boolean {
    return this.config.MIGRATION_TICKET_ID === '*';
  }

  public hasExplicitTicketList(): boolean {
    return !this.isAllTicketsMode();
  }

  public getTargetTicketIds(): number[] {
    return this.parsedTicketIds;
  }

  public isSingleTicketMode(): boolean {
    return this.hasExplicitTicketList();
  }

  public getTargetTicketId(): number | null {
    return this.parsedTicketIds.length > 0 ? (this.parsedTicketIds[0] ?? null) : null;
  }
}
