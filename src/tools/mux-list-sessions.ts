import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxListSessions(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    "mux_list_sessions",
    "List all active mux-mcp sessions",
    inputSchema.shape,
    async (params) => {
      try {
        const sessions = await sessionManager.listBackendSessions();
        const result = { sessions, count: sessions.length };

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
        console.error("[mux-mcp] Unexpected error in mux_list_sessions:", error);
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
