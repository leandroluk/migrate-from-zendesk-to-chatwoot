import { MigrationOrchestrator } from "./services/migration-orchestrator.js";
import { TerminalUI } from "./ui/terminal-ui.js";

/**
 * Ponto de entrada principal da aplicação de migração Zendesk -> Chatwoot.
 * Inicializa o orquestrador e trata erros de execução de nível superior.
 *
 * @spec REQ-MIG-009
 */
async function main(): Promise<void> {
  const ui = TerminalUI.getInstance();

  try {
    const orchestrator = new MigrationOrchestrator();
    await orchestrator.run();
  } catch (error) {
    ui.logError("Erro crítico durante a execução da migração:", error);
    process.exit(1);
  }
}

// Execução imediata
void main();
