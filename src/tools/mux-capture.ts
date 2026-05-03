import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  sessionName: z.string().describe("Name of the session to capture"),
  lines: z
    .number()
    .int()
    .positive()
    .optional()
    .default(500)
    .describe("Max scrollback lines to capture"),
  stripAnsi: z
    .boolean()
    .optional()
    .default(true)
    .describe("Strip ANSI escape codes from output"),
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxCapture(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
  config: MuxMcpConfig,
): void {
  server.tool(
    "mux_capture",
    "Capture the current screen content of a tmux/zellij session",
    inputSchema.shape,
    async (params) => {
      try {
        const sessionName = sessionManager.ensurePrefix(params.sessionName);
        const session = sessionManager.getSession(sessionName);

        // Determine backend from session name or default to tmux
        const backend = backends["tmux"]!;

        const mutex = sessionManager.getMutex(sessionName);
        const captureResult = await mutex.withLock(async () => {
          const result = await backend.capture(
            sessionName,
            params.lines ?? config.captureLines,
            params.stripAnsi ?? config.stripAnsi,
          );

          // Apply output size limit
          const maxBytes = config.outputMaxBytes;
          let content = result.content;
          let truncated = result.truncated;
          if (Buffer.byteLength(content, "utf-8") > maxBytes) {
            content = content.slice(0, maxBytes);
            truncated = true;
          }

          session.markCaptured();
          return { ...result, content, truncated };
        });

        const format: OutputFormat = params.format ?? "json";
        const result = {
          sessionName: captureResult.sessionName,
          content: captureResult.content,
          lineCount: captureResult.lineCount,
          truncated: captureResult.truncated,
          capturedAt: captureResult.capturedAt,
        };

        const response = {
          content: [{ type: "text" as const, text: convertFormat(result, format) }],
        };

        // Auto-destroy if configured
        if (session.shouldAutoDestroy()) {
          await sessionManager.destroySession(sessionName);
        }

        return response;
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
        console.error("[mux-mcp] Unexpected error in mux_capture:", error);
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
