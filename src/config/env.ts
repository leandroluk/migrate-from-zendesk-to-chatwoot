import dotenv from 'dotenv';
import {z} from 'zod';

dotenv.config();

// @spec REQ-MIG-001
export const envSchema = z.object({
  ZENDESK_BASE_URL: z.url(),
  ZENDESK_EMAIL: z.email(),
  ZENDESK_API_TOKEN: z.string().min(1),

  CHATWOOT_BASE_URL: z.url().prefault('https://app.chatwoot.com'),
  CHATWOOT_API_TOKEN: z.string().min(1),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_INBOX_ID: z.coerce.number().int().positive(),

  MIGRATION_TICKET_ID_LIST: z.string().prefault('*'),
  MIGRATION_BATCH_SIZE: z.coerce.number().int().positive().prefault(25),
  MIGRATION_LOCALE: z.string().prefault('pt-BR'),
  MIGRATION_DRY_RUN: z
    .preprocess((v: unknown) => (typeof v === 'string' ? /^(true|1)$/i.test(v.trim()) : Boolean(v)), z.boolean())
    .prefault(false),
  MIGRATION_FORCE_UPDATE: z
    .preprocess((v: unknown) => (typeof v === 'string' ? /^(true|1)$/i.test(v.trim()) : Boolean(v)), z.boolean())
    .prefault(false),
});

// @spec REQ-MIG-001
export type AppConfig = z.infer<typeof envSchema>;

/**
 * Serviço de configuração que valida e entrega as variáveis de ambiente validadas pelo Zod.
 *
 * @spec REQ-MIG-001
 */
export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly config: AppConfig;

  private constructor() {
    this.config = envSchema.parse(process.env);
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

  public isForceUpdate(): boolean {
    return this.config.MIGRATION_FORCE_UPDATE;
  }

  public isAllTicketsMode(): boolean {
    return this.config.MIGRATION_TICKET_ID_LIST === '*';
  }

  public hasExplicitTicketList(): boolean {
    return !this.isAllTicketsMode();
  }

  public getTargetTicketIds(): number[] {
    if (this.config.MIGRATION_TICKET_ID_LIST === '*') return [];
    return this.config.MIGRATION_TICKET_ID_LIST.split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(Boolean);
  }
}
