import type {AppConfig} from '../config';
import type {
  ZendeskComment,
  ZendeskCursorTicketsResponse,
  ZendeskCustomRole,
  ZendeskGroup,
  ZendeskSearchResponse,
  ZendeskTag,
  ZendeskTicket,
  ZendeskUser,
} from '../types';

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
  /**
   * Objeto sintético para representar o sistema ou automações do Zendesk (ID -1 ou <= 0).
   */
  private static readonly SYSTEM_USER: ZendeskUser = {
    id: -1,
    name: 'Sistema Zendesk',
    email: 'sistema@zendesk.local',
    role: 'admin',
    active: true,
  };

  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly userCache: Map<number, ZendeskUser> = new Map();
  private readonly customRolesCache: Map<number, string> = new Map();

  /**
   * Inicializa o cliente do Zendesk com base nas configurações da aplicação.
   *
   * @param config Objeto com configurações de subdomínio, e-mail e token.
   */
  public constructor(config: AppConfig) {
    const rawUrl = new URL(config.ZENDESK_BASE_URL).origin;
    this.baseUrl = rawUrl.endsWith('/api/v2') ? rawUrl : `${rawUrl}/api/v2`;
    const credentials = Buffer.from(`${config.ZENDESK_EMAIL}/token:${config.ZENDESK_API_TOKEN}`).toString('base64');
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
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {...options, headers});

    if (response.status === 404) {
      throw new Error(`[ZendeskClient] Recurso não encontrado (404) em ${endpoint}`);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') ?? '60';
      throw new Error(`[ZendeskClient] Limite de requisições excedido (429). Aguarde ${retryAfter}s.`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[ZendeskClient] Erro HTTP ${response.status} ao acessar ${endpoint}: ${errorBody}`);
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
    const data = await this.request<{user: ZendeskUser}>('/users/me.json');
    return data.user;
  }

  /**
   * Verifica se o usuário atual possui permissões de agente ou administrador para realizar a migração.
   *
   * @spec REQ-MIG-002
   * @returns Objeto com indicador de validade, papel (role) e e-mail.
   */
  public async verifyPermissions(): Promise<{valid: boolean; role: string; email: string}> {
    const user = await this.getCurrentUser();
    const hasPrivilege = user.role === 'admin' || user.role === 'agent';
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
      const data = await this.request<{ticket: ZendeskTicket}>(`/tickets/${ticketId}.json`);
      return data.ticket;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
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
    const data = await this.request<{comments: ZendeskComment[]}>(`/tickets/${ticketId}/comments.json`);
    return data.comments;
  }

  /**
   * Obtém os dados de um usuário pelo ID, mantendo cache em memória para evitar requisições redundantes.
   * Lida de forma resiliente com usuários de sistema (ID <= 0 ou -1) e usuários excluídos ou inválidos (404/400).
   *
   * @spec REQ-MIG-006
   * @param userId ID do usuário no Zendesk.
   * @returns Objeto com dados do usuário.
   */
  public async getUser(userId?: number | null): Promise<ZendeskUser> {
    if (!userId || userId <= 0 || Number.isNaN(userId)) {
      return ZendeskClient.SYSTEM_USER;
    }

    const cached = this.userCache.get(userId);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.request<{user: ZendeskUser}>(`/users/${userId}.json`);
      this.userCache.set(userId, data.user);
      return data.user;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('404') || errorMsg.includes('400')) {
        const fallbackUser: ZendeskUser = {
          id: userId,
          name: `Usuário Zendesk #${userId}`,
          email: `usuario-${userId}@zendesk.local`,
          role: 'end-user',
          active: false,
        };
        this.userCache.set(userId, fallbackUser);
        return fallbackUser;
      }
      throw error;
    }
  }

  /**
   * Lista todas as tags cadastradas no Zendesk para mensuração de arestas.
   *
   * @spec REQ-MIG-003
   * @returns Lista de tags existentes.
   */
  public async listTags(): Promise<ZendeskTag[]> {
    const data = await this.request<{tags: ZendeskTag[]}>('/tags.json');
    return data.tags ?? [];
  }

  /**
   * Lista todos os grupos de atendimento do Zendesk para mapeamento com equipes do Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Lista de grupos do Zendesk.
   */
  public async listGroups(): Promise<ZendeskGroup[]> {
    const data = await this.request<{groups: ZendeskGroup[]}>('/groups.json');
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
    excludedTag: string = 'chatwoot',
    page: number = 1
  ): Promise<ZendeskSearchResponse> {
    const query = encodeURIComponent(`type:ticket -tags:${excludedTag}`);
    const endpoint = `/search.json?query=${query}&sort_by=created_at&sort_order=asc&page=${page}`;
    return await this.request<ZendeskSearchResponse>(endpoint);
  }

  /**
   * Obtém uma página de chamados usando paginação por cursor (cursor-based pagination).
   * Suporta grandes volumes (ex: > 1.000 chamados) sem as limitações da API de busca.
   *
   * @spec REQ-MIG-005
   * @param pageSize Quantidade de itens por página (máximo: 100).
   * @param cursor Token do cursor para a próxima página (opcional).
   * @returns Resposta contendo lista de chamados, metadados de cursor e links.
   */
  public async listTicketsCursor(pageSize: number = 100, cursor?: string): Promise<ZendeskCursorTicketsResponse> {
    let endpoint = `/tickets.json?page[size]=${pageSize}`;
    if (cursor) {
      endpoint += `&page[after]=${encodeURIComponent(cursor)}`;
    }
    return await this.request<ZendeskCursorTicketsResponse>(endpoint);
  }

  /**
   * Retorna a contagem total de chamados ativos no Zendesk via /tickets/count.json.
   *
   * @spec REQ-MIG-005
   */
  public async getTicketCount(): Promise<number> {
    try {
      const data = await this.request<{count: {value: number}}>('/tickets/count.json');
      return data.count?.value ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Adiciona uma tag ao chamado no Zendesk para marcar a conclusão da migração.
   * Ignora silenciosamente erros HTTP 422 caso o chamado já esteja com status 'closed' (somente leitura).
   *
   * @spec REQ-MIG-007
   * @param ticketId ID do chamado no Zendesk.
   * @param tag Nome da tag a ser anexada (ex: 'chatwoot').
   */
  public async addTagToTicket(ticketId: number, tag: string): Promise<void> {
    try {
      await this.request<{tags: string[]}>(`/tickets/${ticketId}/tags.json`, {
        method: 'PUT',
        body: JSON.stringify({tags: [tag]}),
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        errorMsg.includes('422') &&
        (errorMsg.includes('fechado') || errorMsg.includes('closed') || errorMsg.includes('rejeitada'))
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Obtém a lista de papéis personalizados (Custom Roles) configurados no Zendesk.
   * Em planos que não suportam custom roles (não-Enterprise), retorna array vazio com segurança.
   *
   * @spec REQ-MIG-003
   * @returns Lista de Custom Roles do Zendesk.
   */
  public async listCustomRoles(): Promise<ZendeskCustomRole[]> {
    try {
      const data = await this.request<{custom_roles: ZendeskCustomRole[]}>('/custom_roles.json');
      const roles = data.custom_roles ?? [];
      roles.forEach(r => this.customRolesCache.set(r.id, r.name));
      return roles;
    } catch {
      // Planos sem suporte a custom roles ou falta de permissão retornam vazio
      return [];
    }
  }

  /**
   * Resolve dinamicamente o nome do papel do usuário através da API do Zendesk,
   * buscando o nome real caso o usuário possua um custom_role_id cadastrado.
   *
   * @spec REQ-MIG-006
   * @param user Objeto do usuário no Zendesk.
   * @param fallbackFn Função opcional de fallback para papéis nativos.
   * @returns Nome do papel resolvido (ex: "Suporte N2", "Administrador", etc.).
   */
  public async resolveUserRoleName(user: ZendeskUser, fallbackFn?: (role: string) => string): Promise<string> {
    if (!user.id || user.id <= 0) {
      return 'Sistema';
    }

    if (user.custom_role_id) {
      if (this.customRolesCache.size === 0) {
        await this.listCustomRoles();
      }
      const customName = this.customRolesCache.get(user.custom_role_id);
      if (customName) {
        return customName;
      }
    }

    if (fallbackFn) {
      return fallbackFn(user.role);
    }

    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }

  /**
   * Faz o download binário de um anexo do Zendesk com autenticação.
   * Lida adequadamente com redirecionamentos (302) para storage externo (ex: Amazon S3),
   * garantindo que cabeçalhos de autenticação básica não sejam enviados para hosts externos
   * onde causariam erros de autorização.
   *
   * @spec REQ-MIG-006
   * @param contentUrl URL completa de download do anexo no Zendesk.
   * @returns O Blob contendo os dados do arquivo ou null em caso de falha.
   */
  public async downloadAttachment(contentUrl: string): Promise<Blob | null> {
    try {
      // 1. Tenta requisitar a URL do Zendesk com redirect manual para checar redirecionamento ao S3
      const initialResponse = await fetch(contentUrl, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
        },
        redirect: 'manual',
      });

      let targetUrl = contentUrl;
      let sendAuth = true;

      if ([301, 302, 303, 307, 308].includes(initialResponse.status)) {
        const location = initialResponse.headers.get('location');
        if (location) {
          targetUrl = location;
          // URLs pré-assinadas da Amazon S3 / CDN rejeitam Basic Auth adicional
          sendAuth = false;
        }
      }

      const headers: Record<string, string> = {};
      if (sendAuth) {
        headers.Authorization = this.authHeader;
      }

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return null;
      }

      return await response.blob();
    } catch {
      return null;
    }
  }

  /**
   * Retorna a URL completa de visualização do chamado no painel do Zendesk.
   *
   * @spec REQ-MIG-011
   * @param ticketId ID do chamado no Zendesk.
   * @returns URL web do chamado para agentes.
   */
  public getTicketWebUrl(ticketId: number): string {
    const rootUrl = this.baseUrl.replace(/\/api\/v2\/?$/, '');
    return `${rootUrl}/agent/tickets/${ticketId}`;
  }

  /**
   * Remove uma tag de um chamado no Zendesk.
   *
   * @spec REQ-MIG-007
   * @param ticketId ID do chamado.
   * @param tag Nome da tag a ser removida.
   */
  public async removeTagFromTicket(ticketId: number, tag: string): Promise<void> {
    await this.request<{tags: string[]}>(`/tickets/${ticketId}/tags.json`, {
      method: 'DELETE',
      body: JSON.stringify({tags: [tag]}),
    });
  }
}
