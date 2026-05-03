#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { TmuxBackend } from "./backend/tmux-backend.js";
import { ZellijBackend } from "./backend/zellij-backend.js";
import { SessionManager } from "./session/session-manager.js";
import { registerTools } from "./tools/index.js";
import type { MuxBackend } from "./backend/mux-backend.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Initialize backends
  const tmuxBackend = new TmuxBackend(config);
  const zellijBackend = new ZellijBackend();

  // Check availability
  const tmuxAvailable = await tmuxBackend.isAvailable();
  const zellijAvailable = await zellijBackend.isAvailable();

  if (!tmuxAvailable && !zellijAvailable) {
    console.error(
      "[mux-mcp] Neither tmux nor zellij is available. Please install at least one.",
    );
    process.exit(1);
  }

  if (!tmuxAvailable) {
    console.error("[mux-mcp] tmux is not available; using zellij only.");
  }
  if (!zellijAvailable) {
    console.error("[mux-mcp] zellij is not available; using tmux only.");
  }

  const backends: Record<string, MuxBackend> = {};
  if (tmuxAvailable) backends["tmux"] = tmuxBackend;
  if (zellijAvailable) backends["zellij"] = zellijBackend;

  // Use the first available backend as primary
  const primaryBackend = tmuxAvailable ? tmuxBackend : zellijBackend;
  const sessionManager = new SessionManager(primaryBackend, config);

  const server = new McpServer({
    name: "mux-mcp",
    version: "0.1.0",
  });

  registerTools(server, sessionManager, backends, config);

  // Cleanup on shutdown
  const cleanup = async () => {
    console.error("[mux-mcp] Shutting down, cleaning up sessions...");
    await sessionManager.destroyAll().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mux-mcp] Server running on stdio");
}

main().catch((error) => {
  console.error("[mux-mcp] Fatal error:", error);
  process.exit(1);
});
