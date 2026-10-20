import cliProgress from "cli-progress";
import ora, { type Ora } from "ora";
import pc from "picocolors";

/**
 * Interface que define os dados consolidados do resumo de execução da migração.
 */
export interface MigrationSummaryStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Classe responsável por gerenciar toda a interface e feedback visual no terminal.
 * Provê spinners interativos, barras de progresso com contadores e formatação em cores.
 *
 * @spec REQ-MIG-008
 */
export class TerminalUI {
  private static instance: TerminalUI | null = null;
  private currentSpinner: Ora | null = null;
  private progressBar: cliProgress.SingleBar | null = null;

  /**
   * Construtor privado para singleton.
   */
  private constructor() {}

  /**
   * Obtém a instância única do gerenciador de interface do terminal.
   *
   * @returns Instância do TerminalUI.
   */
  public static getInstance(): TerminalUI {
    if (!TerminalUI.instance) {
      TerminalUI.instance = new TerminalUI();
    }
    return TerminalUI.instance;
  }

  /**
   * Exibe o banner de apresentação do projeto no terminal.
   */
  public printBanner(): void {
    console.log("\n" + pc.cyan("╔══════════════════════════════════════════════════════════════╗"));
    console.log(
      pc.cyan("║") +
        pc.bold(pc.white("   MIGRAÇÃO DE CHAMADOS: ZENDESK  ➜  CHATWOOT (POC)          ")) +
        pc.cyan("║"),
    );
    console.log(pc.cyan("╚══════════════════════════════════════════════════════════════╝\n"));
  }

  /**
   * Inicia um spinner animado com a mensagem especificada.
   *
   * @param message Mensagem descritiva da operação em andamento.
   */
  public startSpinner(message: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }
    this.currentSpinner = ora({
      text: pc.white(message),
      color: "cyan",
    }).start();
  }

  /**
   * Conclui o spinner ativo com status de sucesso.
   *
   * @param message Mensagem de sucesso opcional.
   */
  public succeedSpinner(message?: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.succeed(message ? pc.green(message) : undefined);
      this.currentSpinner = null;
    }
  }

  /**
   * Conclui o spinner ativo com status de falha.
   *
   * @param message Mensagem de falha opcional.
   */
  public failSpinner(message?: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.fail(message ? pc.red(message) : undefined);
      this.currentSpinner = null;
    }
  }

  /**
   * Conclui o spinner ativo com aviso (warning).
   *
   * @param message Mensagem de aviso opcional.
   */
  public warnSpinner(message?: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.warn(message ? pc.yellow(message) : undefined);
      this.currentSpinner = null;
    }
  }

  /**
   * Cria e inicializa uma barra de progresso visual para processamento de múltiplos itens.
   *
   * @param total Quantidade total de chamados a processar.
   * @param title Rótulo descritivo da barra.
   * @returns Instância da barra de progresso criada.
   */
  public createProgressBar(total: number, title: string = "Migrando"): cliProgress.SingleBar {
    if (this.progressBar) {
      this.progressBar.stop();
    }

    this.progressBar = new cliProgress.SingleBar(
      {
        format: `${pc.cyan("{bar}")} | ${pc.bold("{percentage}%")} | {value}/{total} Chamados | ETA: {eta_formatted} | ${pc.dim("{status}")}`,
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );

    this.progressBar.start(total, 0, { status: title });
    return this.progressBar;
  }

  /**
   * Atualiza o valor atual e o status exibido na barra de progresso.
   *
   * @param current Número de chamados processados até o momento.
   * @param tokens Parâmetros dinâmicos adicionais como texto de status.
   */
  public updateProgressBar(current: number, tokens?: Record<string, unknown>): void {
    if (this.progressBar) {
      this.progressBar.update(current, tokens);
    }
  }

  /**
   * Finaliza e interrompe a barra de progresso ativa.
   */
  public stopProgressBar(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  /**
   * Imprime uma mensagem informativa no console.
   *
   * @param message Mensagem de texto.
   */
  public logInfo(message: string): void {
    console.log(pc.blue("ℹ ") + pc.white(message));
  }

  /**
   * Imprime uma mensagem de sucesso no console.
   *
   * @param message Mensagem de texto.
   */
  public logSuccess(message: string): void {
    console.log(pc.green("✔ ") + pc.green(message));
  }

  /**
   * Imprime uma mensagem de aviso no console.
   *
   * @param message Mensagem de texto.
   */
  public logWarning(message: string): void {
    console.log(pc.yellow("⚠ ") + pc.yellow(message));
  }

  /**
   * Imprime uma mensagem de erro detalhada no console.
   *
   * @param message Mensagem de texto descritiva do erro.
   * @param error Objeto ou causa raiz do erro.
   */
  public logError(message: string, error?: unknown): void {
    console.error(pc.red("✖ ") + pc.bold(pc.red(message)));
    if (error instanceof Error) {
      console.error(pc.dim(`  Detalhes: ${error.message}`));
      if (error.stack) {
        console.error(pc.dim(`  Stack: ${error.stack.split("\n").slice(1, 3).join("\n")}`));
      }
    } else if (error) {
      console.error(pc.dim(`  Detalhes: ${String(error)}`));
    }
  }

  /**
   * Exibe um quadro consolidado com o resumo da execução da migração.
   *
   * @param stats Estatísticas acumuladas da execução.
   */
  public printSummary(stats: MigrationSummaryStats): void {
    const elapsedSeconds = ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(
      1,
    );

    console.log("\n" + pc.bold(pc.cyan("📊 RESUMO DA EXECUÇÃO:")));
    console.log(pc.white(`   - Total avaliado:     ${stats.total}`));
    console.log(pc.green(`   - Migrados com êxito: ${stats.success}`));
    console.log(pc.red(`   - Falhas/Erros:       ${stats.failed}`));
    console.log(pc.yellow(`   - Ignorados/Saltados: ${stats.skipped}`));
    console.log(pc.dim(`   - Tempo decorrido:    ${elapsedSeconds}s\n`));
  }
}
