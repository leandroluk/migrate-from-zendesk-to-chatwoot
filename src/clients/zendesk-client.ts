import type { AppConfig } from "../config/env.js";
import type {
  ZendeskComment,
  ZendeskGroup,
  ZendeskSearchResponse,
  ZendeskTag,
  ZendeskTicket,
  ZendeskUser,
} from "../types/zendesk.js";

/**
 * Cliente HTTP orientado a objetos para interação com a API REST v2 do Zendesk.
 * Utiliza o fetch nativo do Node.js e autenticação básica via token de API.
 *
 * @spec REQ-MIG-002
 * @spec REQ-MIG-003
 * @spec REQ-MIG-004
 * @spec REQ-MIG-005
 * @spec REQ-MIG-007
 */
export class ZendeskClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly userCache: Map<number, ZendeskUser> = new Map();

  /**
   * Inicializa o cliente do Zendesk com base nas configurações da aplicação.
   *
   * @param config Objeto com configurações de subdomínio, e-mail e token.
   */
  public constructor(config: AppConfig) {
    this.baseUrl = `https://${config.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
    const credentials = Buffer.from(
      `${config.ZENDESK_EMAIL}/token:${config.ZENDESK_API_TOKEN}`,
    ).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Executa uma requisição HTTP genérica à API do Zendesk com tratamento de status.
   *
   * @template T Tipo esperado da resposta JSON.
   * @param endpoint Caminho relativo do endpoint (ex: '/users/me.json').
   * @param options Opções adicionais da requisição (método, body, headers).
   * @returns Promessa com os dados tipados retornados.
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 404) {
      throw new Error(`[ZendeskClient] Recurso não encontrado (404) em ${endpoint}`);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") ?? "60";
      throw new Error(
        `[ZendeskClient] Limite de requisições excedido (429). Aguarde ${retryAfter}s.`,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[ZendeskClient] Erro HTTP ${response.status} ao acessar ${endpoint}: ${errorBody}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Obtém os dados do usuário autenticado no Zendesk.
   *
   * @spec REQ-MIG-002
   * @returns Promessa com o ZendeskUser da sessão atual.
   */
  public async getCurrentUser(): Promise<ZendeskUser> {
    const data = await this.request<{ user: ZendeskUser }>("/users/me.json");
    return data.user;
  }

  /**
   * Verifica se o usuário atual possui permissões de agente ou administrador para realizar a migração.
   *
   * @spec REQ-MIG-002
   * @returns Objeto com indicador de validade, papel (role) e e-mail.
   */
  public async verifyPermissions(): Promise<{ valid: boolean; role: string; email: string }> {
    const user = await this.getCurrentUser();
    const hasPrivilege = user.role === "admin" || user.role === "agent";
    return {
      valid: hasPrivilege && user.active,
      role: user.role,
      email: user.email,
    };
  }

  /**
   * Busca um chamado pontual pelo seu identificador numérico.
   * Utilizado especialmente no modo seguro de produção.
   *
   * @spec REQ-MIG-004
   * @param ticketId ID do chamado no Zendesk.
   * @returns Objeto do chamado ou null caso não encontrado.
   */
  public async getTicket(ticketId: number): Promise<ZendeskTicket | null> {
    try {
      const data = await this.request<{ ticket: ZendeskTicket }>(`/tickets/${ticketId}.json`);
      return data.ticket;
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Obtém todos os comentários históricos vinculados a um chamado específico.
   *
   * @spec REQ-MIG-006
   * @param ticketId ID do chamado no Zendesk.
   * @returns Lista de comentários ordenados cronologicamente.
   */
  public async getTicketComments(ticketId: number): Promise<ZendeskComment[]> {
    const data = await this.request<{ comments: ZendeskComment[] }>(
      `/tickets/${ticketId}/comments.json`,
    );
    return data.comments;
  }

  /**
   * Obtém os dados de um usuário pelo ID, mantendo cache em memória para evitar requisições redundantes.
   *
   * @spec REQ-MIG-006
   * @param userId ID do usuário no Zendesk.
   * @returns Objeto com dados do usuário.
   */
  public async getUser(userId: number): Promise<ZendeskUser> {
    const cached = this.userCache.get(userId);
    if (cached) {
      return cached;
    }

    const data = await this.request<{ user: ZendeskUser }>(`/users/${userId}.json`);
    this.userCache.set(userId, data.user);
    return data.user;
  }

  /**
   * Lista todas as tags cadastradas no Zendesk para mensuração de arestas.
   *
   * @spec REQ-MIG-003
   * @returns Lista de tags existentes.
   */
  public async listTags(): Promise<ZendeskTag[]> {
    const data = await this.request<{ tags: ZendeskTag[] }>("/tags.json");
    return data.tags ?? [];
  }

  /**
   * Lista todos os grupos de atendimento do Zendesk para mapeamento com equipes do Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Lista de grupos do Zendesk.
   */
  public async listGroups(): Promise<ZendeskGroup[]> {
    const data = await this.request<{ groups: ZendeskGroup[] }>("/groups.json");
    return data.groups ?? [];
  }

  /**
   * Executa busca de chamados que não contenham a tag especificada (ex: 'chatwoot').
   * Usado para a iteração contínua em lote até zerar a fila.
   *
   * @spec REQ-MIG-005
   * @param excludedTag Tag que identifica chamados já migrados (padrão: 'chatwoot').
   * @param page Número da página para paginação.
   * @returns Resposta com a lista de chamados e metadados de paginação.
   */
  public async searchTicketsWithoutTag(
    excludedTag: string = "chatwoot",
    page: number = 1,
  ): Promise<ZendeskSearchResponse> {
    const query = encodeURIComponent(`type:ticket -tags:${excludedTag}`);
    const endpoint = `/search.json?query=${query}&sort_by=created_at&sort_order=asc&page=${page}`;
    return await this.request<ZendeskSearchResponse>(endpoint);
  }

  /**
   * Adiciona uma tag ao chamado no Zendesk para marcar a conclusão da migração.
   *
   * @spec REQ-MIG-007
   * @param ticketId ID do chamado no Zendesk.
   * @param tag Nome da tag a ser anexada (ex: 'chatwoot').
   */
  public async addTagToTicket(ticketId: number, tag: string): Promise<void> {
    await this.request<{ tags: string[] }>(`/tickets/${ticketId}/tags.json`, {
      method: "PUT",
      body: JSON.stringify({ tags: [tag] }),
    });
  }
}
