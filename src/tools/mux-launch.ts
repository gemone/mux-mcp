import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  sessionName: z
    .string()
    .optional()
    .describe("Custom session name (default: auto-generated)"),
  workingDir: z.string().optional().describe("Working directory for the command"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional environment variables"),
  backend: z
    .enum(["tmux", "zellij"])
    .optional()
    .default("tmux")
    .describe("Terminal multiplexer backend to use"),
  autoDestroy: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, destroy session after first capture or verify"),
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxLaunch(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
  _config: MuxMcpConfig,
): void {
  server.tool(
    "mux_launch",
    "Launch a command in a new tmux or zellij session",
    inputSchema.shape,
    async (params) => {
      try {
        const backendName = params.backend ?? "tmux";
        const backend = backends[backendName];
        if (!backend) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "BACKEND_NOT_FOUND",
                  message: `Backend "${backendName}" is not available`,
                }),
              },
            ],
            isError: true,
          };
        }

        const sessionName = sessionManager.ensurePrefix(
          params.sessionName ?? sessionManager.generateName(),
        );

        sessionManager.createSession(
          sessionName,
          params.command,
          params.autoDestroy ?? false,
        );

        await backend.launch(
          sessionName,
          params.command,
          params.workingDir,
          params.env,
        );

        const result = {
          sessionName,
          command: params.command,
          backend: backendName,
          autoDestroy: params.autoDestroy ?? false,
          createdAt: new Date().toISOString(),
        };

        const format: OutputFormat = params.format ?? "json";
        return {
          content: [{ type: "text" as const, text: convertFormat(result, format) }],
        };
      } catch (error) {
        if (error instanceof MuxError) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error.code,
                  message: error.message,
                  details: error.details,
                }),
              },
            ],
            isError: true,
          };
        }
        console.error("[mux-mcp] Unexpected error in mux_launch:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
