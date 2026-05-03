import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend, AssertionResult } from "../backend/mux-backend.js";
import type { TmuxBackend } from "../backend/tmux-backend.js";
import { MuxError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat } from "../types.js";

const inputSchema = z.object({
  sessionName: z.string().describe("Name of the session to verify"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(30000)
    .describe("Max time in ms to wait for assertions to pass"),
  pollInterval: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1000)
    .describe("Polling interval in ms"),
  exitCode: z.number().int().optional().describe("Expected exit code"),
  outputContains: z
    .string()
    .optional()
    .describe("String that must appear in the output"),
  outputRegex: z
    .string()
    .optional()
    .describe("Regex pattern that must match the output"),
  outputExact: z
    .string()
    .optional()
    .describe("Exact string the output must match"),
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

function evaluateAssertions(
  content: string,
  exitCode: number,
  params: {
    exitCode?: number;
    outputContains?: string;
    outputRegex?: string;
    outputExact?: string;
  },
): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (params.exitCode !== undefined) {
    results.push({
      type: "exitCode",
      expected: params.exitCode,
      passed: exitCode === params.exitCode,
      message:
        exitCode === params.exitCode
          ? `Exit code matches: ${exitCode}`
          : `Exit code mismatch: expected ${params.exitCode}, got ${exitCode}`,
    });
  }

  if (params.outputContains !== undefined) {
    const found = content.includes(params.outputContains);
    results.push({
      type: "outputContains",
      expected: params.outputContains,
      passed: found,
      message: found
        ? `Output contains "${params.outputContains}"`
        : `Output does not contain "${params.outputContains}"`,
    });
  }

  if (params.outputRegex !== undefined) {
    try {
      const regex = new RegExp(params.outputRegex);
      const found = regex.test(content);
      results.push({
        type: "outputRegex",
        expected: params.outputRegex,
        passed: found,
        message: found
          ? `Output matches regex /${params.outputRegex}/`
          : `Output does not match regex /${params.outputRegex}/`,
      });
    } catch {
      results.push({
        type: "outputRegex",
        expected: params.outputRegex,
        passed: false,
        message: `Invalid regex: ${params.outputRegex}`,
      });
    }
  }

  if (params.outputExact !== undefined) {
    const matches = content.trim() === params.outputExact;
    results.push({
      type: "outputExact",
      expected: params.outputExact,
      passed: matches,
      message: matches
        ? "Output matches exactly"
        : "Output does not match exactly",
    });
  }

  return results;
}

export function registerMuxVerify(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
  config: MuxMcpConfig,
): void {
  server.tool(
    "mux_verify",
    "Capture session output and verify it against assertions",
    inputSchema.shape,
    async (params) => {
      try {
        const sessionName = sessionManager.ensurePrefix(params.sessionName);
        const session = sessionManager.getSession(sessionName);

        const backend = backends["tmux"]!;
        const tmuxBackend = backend as TmuxBackend;

        const timeout = params.timeout ?? config.verifyTimeout;
        const pollInterval = params.pollInterval ?? config.verifyPollInterval;
        const hasAssertions =
          params.exitCode !== undefined ||
          params.outputContains !== undefined ||
          params.outputRegex !== undefined ||
          params.outputExact !== undefined;

        if (!hasAssertions) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "INVALID_INPUT",
                  message:
                    "At least one assertion (exitCode, outputContains, outputRegex, outputExact) is required",
                }),
              },
            ],
            isError: true,
          };
        }

        const mutex = sessionManager.getMutex(sessionName);
        const verifyResult = await mutex.withLock(async () => {
          const startTime = Date.now();
          let lastContent = "";
          let lastExitCode = -1;
          let assertions: AssertionResult[] = [];

          while (true) {
            const captureResult = await backend.capture(
              sessionName,
              params.lines ?? config.captureLines,
              params.stripAnsi ?? config.stripAnsi,
            );
            lastContent = captureResult.content;

            // Try to get exit code
            if ("getExitCode" in tmuxBackend) {
              lastExitCode = await tmuxBackend.getExitCode(sessionName);
            }

            assertions = evaluateAssertions(lastContent, lastExitCode, {
              exitCode: params.exitCode,
              outputContains: params.outputContains,
              outputRegex: params.outputRegex,
              outputExact: params.outputExact,
            });

            const allPassed = assertions.every((a) => a.passed);
            if (allPassed) {
              return {
                passed: true,
                assertions,
                capturedOutput: lastContent,
                exitCode: lastExitCode,
                verifiedAt: new Date().toISOString(),
              };
            }

            // If exitCode is expected and we have a real exit code that doesn't match, no point polling
            if (
              params.exitCode !== undefined &&
              lastExitCode !== -1 &&
              lastExitCode !== params.exitCode
            ) {
              return {
                passed: false,
                assertions,
                capturedOutput: lastContent,
                exitCode: lastExitCode,
                verifiedAt: new Date().toISOString(),
              };
            }

            // If all output assertions failed and exit code is available, no point polling
            if (
              lastExitCode !== -1 &&
              assertions
                .filter((a) => a.type !== "exitCode")
                .every((a) => !a.passed)
            ) {
              return {
                passed: false,
                assertions,
                capturedOutput: lastContent,
                exitCode: lastExitCode,
                verifiedAt: new Date().toISOString(),
              };
            }

            // Check timeout
            if (Date.now() - startTime >= timeout) {
              return {
                passed: false,
                assertions,
                capturedOutput: lastContent,
                exitCode: lastExitCode,
                verifiedAt: new Date().toISOString(),
              };
            }

            // Wait before next poll
            await new Promise((r) => setTimeout(r, pollInterval));
          }
        });

        session.markCaptured();

        const result = {
          sessionName,
          ...verifyResult,
        };

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
        console.error("[mux-mcp] Unexpected error in mux_verify:", error);
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
