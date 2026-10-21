import type {ChatwootClient, ZendeskClient} from '../clients';
import type {PermissionValidationResult} from '../types';
import {TerminalUI} from '../ui';

/**
 * Serviço responsável por executar o Passo 1 do fluxo:
 * Autenticar no Zendesk e no Chatwoot e verificar ativamente se o usuário possui todas as permissões necessárias.
 *
 * @spec REQ-MIG-002
 */
export class PermissionService {
  private readonly zendeskClient: ZendeskClient;
  private readonly chatwootClient: ChatwootClient;
  private readonly ui: TerminalUI;

  /**
   * Construtor do PermissionService.
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
   * Executa a validação de autenticação e permissões em ambas as plataformas.
   *
   * @spec REQ-MIG-002
   * @returns Resultado consolidado com indicador de sucesso e lista de erros caso haja pendências.
   */
  public async validatePermissions(): Promise<PermissionValidationResult> {
    this.ui.startSpinner('Validando credenciais e permissões no Zendesk e Chatwoot...');
    const errors: string[] = [];

    let zendeskRole = 'unknown';
    let zendeskAuth = false;

    // 1. Validação no Zendesk
    try {
      const zdCheck = await this.zendeskClient.verifyPermissions();
      zendeskRole = zdCheck.role;
      zendeskAuth = zdCheck.valid;

      if (!zdCheck.valid) {
        errors.push(
          `Zendesk: Usuário (${zdCheck.email}) possui papel '${zdCheck.role}', mas necessita ser 'admin' ou 'agent' ativo.`
        );
      }
    } catch (error) {
      errors.push(`Zendesk: Falha na autenticação - ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Validação no Chatwoot
    let cwAuth = false;
    let cwIsAdmin = false;

    try {
      const cwCheck = await this.chatwootClient.verifyAdminAccess();
      cwAuth = cwCheck.valid;
      cwIsAdmin = cwCheck.valid;

      if (!cwCheck.valid) {
        errors.push(
          `Chatwoot: Usuário (${cwCheck.email ?? 'desconhecido'}) não possui papel de administrador na conta configurada.`
        );
      }
    } catch (error) {
      errors.push(`Chatwoot: Falha na autenticação - ${error instanceof Error ? error.message : String(error)}`);
    }

    const result: PermissionValidationResult = {
      zendeskAuthenticated: zendeskAuth,
      zendeskUserRole: zendeskRole,
      chatwootAuthenticated: cwAuth,
      chatwootIsAdmin: cwIsAdmin,
      errors,
    };

    if (errors.length > 0) {
      this.ui.failSpinner('Falha na verificação de permissões.');
      errors.forEach(err => this.ui.logError(err));
    } else {
      this.ui.doneSpinner('Autenticação e permissões confirmadas no Zendesk e Chatwoot!');
    }

    return result;
  }
}
