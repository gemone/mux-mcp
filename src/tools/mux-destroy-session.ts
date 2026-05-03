import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  sessionName: z.string().describe("Name of the session to destroy"),
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxDestroySession(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
): void {
  server.tool(
    "mux_destroy_session",
    "Destroy a tmux/zellij session and clean up resources",
    inputSchema.shape,
    async (params) => {
      try {
        const sessionName = sessionManager.ensurePrefix(params.sessionName);
        const backend = backends["tmux"]!;

        const mutex = sessionManager.getMutex(sessionName);
        const destroyed = await mutex.withLock(async () => {
          try {
            await backend.destroy(sessionName);
          } catch {
            // Idempotent — session may already be gone
          }
          const existed = sessionManager.hasSession(sessionName);
          sessionManager.removeSession(sessionName);
          return existed;
        });

        const format: OutputFormat = params.format ?? "json";
        const result = { sessionName, destroyed };
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
        console.error("[mux-mcp] Unexpected error in mux_destroy_session:", error);
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
