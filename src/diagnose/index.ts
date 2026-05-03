import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import { chatCompletion } from "./model-client.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  sessionName: z.string().describe("Name of the session to diagnose"),
  question: z
    .string()
    .optional()
    .describe(
      "Specific question about the output (default: analyze errors and explain issues)",
    ),
  lines: z
    .number()
    .int()
    .positive()
    .optional()
    .default(500)
    .describe("Max scrollback lines"),
  stripAnsi: z
    .boolean()
    .optional()
    .default(true)
    .describe("Strip ANSI escape codes"),
  format: z
    .enum(["json", "yaml", "md"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export function registerMuxDiagnose(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
  config: MuxMcpConfig,
): void {
  server.tool(
    "mux_diagnose",
    "Use an LLM to diagnose why a command is failing or behaving unexpectedly",
    inputSchema.shape,
    async (params) => {
      try {
        if (!config.model) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "NOT_CONFIGURED",
                  message:
                    "Model diagnosis is not configured. Set MUX_MCP_MODEL_BASE_URL, MUX_MCP_MODEL_API_KEY, and MUX_MCP_MODEL_NAME environment variables.",
                }),
              },
            ],
            isError: true,
          };
        }

        const sessionName = sessionManager.ensurePrefix(params.sessionName);
        const session = sessionManager.getSession(sessionName);
        const backend = backends["tmux"]!;

        const mutex = sessionManager.getMutex(sessionName);
        const result = await mutex.withLock(async () => {
          const captureResult = await backend.capture(
            sessionName,
            params.lines ?? config.captureLines,
            params.stripAnsi ?? config.stripAnsi,
          );

          const question =
            params.question ??
            "Analyze this terminal output and explain any errors, issues, or unexpected behavior. Be concise and actionable.";

          const diagnosis = await chatCompletion(config.model!, [
            {
              role: "system",
              content:
                "You are a debugging assistant. Analyze the following terminal output from a command and answer the user's question. Be concise and actionable.",
            },
            {
              role: "user",
              content: `## Terminal Output\n\n\`\`\`\n${captureResult.content}\n\`\`\`\n\n## Question\n\n${question}`,
            },
          ]);

          session.markCaptured();

          return {
            sessionName,
            question,
            diagnosis,
            capturedOutput: captureResult.content,
            model: config.model!.model,
            diagnosedAt: new Date().toISOString(),
          };
        });

        const format: OutputFormat = params.format ?? "json";
        const response = {
          content: [{ type: "text" as const, text: convertFormat(result, format) }],
        };

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
        console.error("[mux-mcp] Unexpected error in mux_diagnose:", error);
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
