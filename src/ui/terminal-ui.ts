import fs from 'node:fs';
import path from 'node:path';
import cliProgress from 'cli-progress';
import ora, {type Ora} from 'ora';
import pc from 'picocolors';

/**
 * Interface que define os dados consolidados do resumo de execução da migração.
 */
export interface MigrationViewStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Classe responsável por gerenciar toda a interface e feedback visual no terminal,
 * além de persistir os logs detalhados em arquivo local temporário fora do git.
 *
 * @spec REQ-MIG-008
 */
export class TerminalUI {
  private static instance: TerminalUI | null = null;
  private currentSpinner: Ora | null = null;
  private progressBar: cliProgress.SingleBar | null = null;
  private isProgressBarOnCurrentLine = false;
  private readonly logFilePath: string;

  /**
   * Construtor privado para singleton e inicialização do arquivo de log.
   */
  private constructor() {
    const logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, {recursive: true});
    }

    this.logFilePath = path.join(logsDir, 'migration.log');
    this.writeToFile(`\n================ SESSÃO INICIADA: ${new Date().toISOString()} ================`);
  }

  /**
   * Escreve uma entrada de texto formatada no arquivo de log de forma síncrona e imediata,
   * garantindo que nenhum log seja perdido em caso de encerramento inesperado ou interrupção no debug.
   *
   * @param text Texto a ser gravado no log.
   */
  private writeToFile(text: string): void {
    try {
      // eslint-disable-next-line no-control-regex
      const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(this.logFilePath, `[${timestamp}] ${clean}\n`, 'utf-8');
    } catch (error) {
      console.error('[TerminalUI] Falha ao gravar log:', error);
    }
  }

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
   * Retorna o caminho do arquivo de log ativo.
   */
  public getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Exibe o banner de apresentação do projeto no terminal e o caminho do log.
   */
  public printBanner(): void {
    const pipe = pc.cyan('║');
    console.log('\n' + pc.cyan('╔══════════════════════════════════════════════════════════════╗'));
    console.log(pipe + pc.bold(pc.white('   MIGRAÇÃO DE CHAMADOS: ZENDESK  ➜  CHATWOOT (Tool)          ')) + pipe);
    console.log(pc.cyan('╚══════════════════════════════════════════════════════════════╝'));
    console.log(pc.dim(`  📄 Logs da sessão gravados em: ${this.logFilePath}\n`));
  }

  /**
   * Inicia um spinner animado com a mensagem especificada e grava no arquivo de log.
   *
   * @param message Mensagem descritiva da operação em andamento.
   */
  public startSpinner(message: string): void {
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }
    this.writeToFile(`[STEP] ${message}`);
    this.currentSpinner = ora({
      text: pc.white(message),
      color: 'cyan',
    }).start();
  }

  /**
   * Conclui o spinner ativo com status de sucesso.
   *
   * @param message Mensagem de sucesso opcional.
   */
  public doneSpinner(message?: string): void {
    if (this.currentSpinner) {
      const text = message ?? this.currentSpinner.text;
      this.writeToFile(`[DONE] ${text}`);
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
      const text = message ?? this.currentSpinner.text;
      this.writeToFile(`[FAIL] ${text}`);
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
      const text = message ?? this.currentSpinner.text;
      this.writeToFile(`[WARN] ${text}`);
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
  public createProgressBar(total: number, title: string = 'Migrando'): cliProgress.SingleBar {
    if (this.progressBar) {
      this.progressBar.stop();
    }

    this.writeToFile(`[PROGRESS_START] Total: ${total} itens | ${title}`);

    this.progressBar = new cliProgress.SingleBar(
      {
        format: `${pc.cyan('{bar}')} | ${pc.bold('{percentage}%')} | {value}/{total} Chamados | ETA: {eta_formatted} | ${pc.dim('{status}')}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    this.progressBar.start(total, 0, {status: title});
    this.isProgressBarOnCurrentLine = true;
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
      this.isProgressBarOnCurrentLine = true;
    }
  }

  /**
   * Finaliza e interrompe a barra de progresso ativa.
   */
  public stopProgressBar(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
      this.isProgressBarOnCurrentLine = false;
      this.writeToFile('[PROGRESS_END]');
    }
  }

  /**
   * Quebra de linha preventiva caso a barra de progresso esteja ativa na linha corrente,
   * evitando que mensagens de log fiquem coladas ao lado direito da barra.
   */
  private breakLineIfProgressBarActive(): void {
    if (this.isProgressBarOnCurrentLine) {
      process.stdout.write('\n');
      this.isProgressBarOnCurrentLine = false;
    }
  }

  /**
   * Imprime uma mensagem informativa no console e grava no log.
   *
   * @param message Mensagem de texto.
   */
  public logInfo(message: string): void {
    this.breakLineIfProgressBarActive();
    this.writeToFile(`[INFO] ${message}`);
    console.log(pc.blue('ℹ ') + pc.white(message));
  }

  /**
   * Imprime uma mensagem de sucesso no console e grava no log.
   *
   * @param message Mensagem de texto.
   */
  public logDone(message: string): void {
    this.breakLineIfProgressBarActive();
    this.writeToFile(`[DONE] ${message}`);
    console.log(pc.green('✔ ') + pc.green(message));
  }

  /**
   * Imprime uma mensagem de aviso no console e grava no log.
   *
   * @param message Mensagem de texto.
   * @param error Objeto ou causa raiz do erro opcional.
   */
  public logWarn(message: string, error?: unknown): void {
    this.breakLineIfProgressBarActive();
    let details = '';
    if (error instanceof Error) {
      details = ` (${error.message})`;
    } else if (error) {
      details = ` (${String(error)})`;
    }
    this.writeToFile(`[WARN] ${message}${details}`);
    console.log(pc.yellow('⚠ ') + pc.yellow(message) + (details ? pc.dim(details) : ''));
  }

  /**
   * Imprime uma mensagem de erro detalhada no console e no arquivo de log.
   *
   * @param message Mensagem de texto descritiva do erro.
   * @param error Objeto ou causa raiz do erro.
   */
  public logError(message: string, error?: unknown): void {
    this.breakLineIfProgressBarActive();
    let details = '';
    if (error instanceof Error) {
      details = `\n  Detalhes: ${error.message}`;
      if (error.stack) {
        details += `\n  Stack: ${error.stack}`;
      }
    } else if (error) {
      details = `\n  Detalhes: ${String(error)}`;
    }

    this.writeToFile(`[ERROR] ${message}${details}`);

    console.error(pc.red('✖ ') + pc.bold(pc.red(message)));
    if (error instanceof Error) {
      console.error(pc.dim(`  Detalhes: ${error.message}`));
      if (error.stack) {
        console.error(pc.dim(`  Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`));
      }
    } else if (error) {
      console.error(pc.dim(`  Detalhes: ${String(error)}`));
    }
  }

  /**
   * Exibe um quadro consolidado com o resumo da execução da migração e grava no arquivo de log.
   *
   * @param stats Estatísticas acumuladas da execução.
   */
  public printView(stats: MigrationViewStats): void {
    const elapsedSeconds = ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(1);

    const viewText =
      `VISÃO GERAL DA EXECUÇÃO:\n` +
      `   - Total avaliado:     ${stats.total}\n` +
      `   - Migrados com êxito: ${stats.success}\n` +
      `   - Falhas/Erros:       ${stats.failed}\n` +
      `   - Ignorados/Saltados: ${stats.skipped}\n` +
      `   - Tempo decorrido:    ${elapsedSeconds}s\n` +
      `   - Arquivo de log:     ${this.logFilePath}`;

    this.writeToFile(`[VIEW]\n${viewText}`);

    console.log('\n' + pc.bold(pc.cyan('📊 RESUMO DA EXECUÇÃO:')));
    console.log(pc.white(`   - Total avaliado:     ${stats.total}`));
    console.log(pc.green(`   - Migrados com êxito: ${stats.success}`));
    console.log(pc.red(`   - Falhas/Erros:       ${stats.failed}`));
    console.log(pc.yellow(`   - Ignorados/Saltados: ${stats.skipped}`));
    console.log(pc.dim(`   - Tempo decorrido:    ${elapsedSeconds}s`));
    console.log(pc.dim(`   - Log gravado em:     ${this.logFilePath}\n`));
  }
}
