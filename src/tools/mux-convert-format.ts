import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FormatError } from "../errors/index.js";
import { convertFormat } from "../format/converter.js";
import type { OutputFormat, Formattable } from "../types.js";

const inputSchema = z.object({
  data: z.string().describe("JSON string of the data to convert"),
  targetFormat: z
    .enum(["json", "yaml", "md"])
    .describe("Target output format"),
  title: z.string().optional().describe("Title for markdown output"),
});

export function registerMuxConvertFormat(server: McpServer): void {
  server.tool(
    "mux_convert_format",
    "Convert captured output data into a different format (json/yaml/md)",
    inputSchema.shape,
    async (params) => {
      try {
        let parsed: Formattable;
        try {
          parsed = JSON.parse(params.data) as Formattable;
        } catch {
          throw new FormatError("Invalid JSON input data");
        }

        const format: OutputFormat = params.targetFormat;
        const formatted = convertFormat(parsed, format, params.title);
        const result = { formatted, format };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        if (error instanceof FormatError) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error.code,
                  message: error.message,
                }),
              },
            ],
            isError: true,
          };
        }
        console.error("[mux-mcp] Unexpected error in mux_convert_format:", error);
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
