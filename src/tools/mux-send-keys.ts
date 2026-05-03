import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  sessionName: z.string().describe("Name of the target session"),
  keys: z
    .string()
    .describe("Keys to send (tmux key names: Enter, C-c, Space, etc.)"),
  literal: z
    .boolean()
    .optional()
    .default(false)
    .describe("Send keys literally without interpretation"),
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxSendKeys(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
): void {
  server.tool(
    "mux_send_keys",
    "Send key input to a running tmux/zellij session",
    inputSchema.shape,
    async (params) => {
      try {
        const sessionName = sessionManager.ensurePrefix(params.sessionName);
        sessionManager.getSession(sessionName);

        const backend = backends["tmux"]!;
        const mutex = sessionManager.getMutex(sessionName);

        const sendResult = await mutex.withLock(async () =>
          backend.sendKeys(sessionName, params.keys, params.literal),
        );
        const result = { ...sendResult } as Record<string, unknown>;

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
        console.error("[mux-mcp] Unexpected error in mux_send_keys:", error);
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
