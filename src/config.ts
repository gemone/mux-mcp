import { ConfigError } from "./errors/index.js";

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface MuxMcpConfig {
  readonly tmuxSocket: string;
  readonly maxSessions: number;
  readonly captureLines: number;
  readonly outputMaxBytes: number;
  readonly verifyTimeout: number;
  readonly verifyPollInterval: number;
  readonly stripAnsi: boolean;
  readonly model: ModelConfig | null;
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0) {
    throw new ConfigError(`Invalid value for ${name}: "${raw}" (expected positive integer)`);
  }
  return val;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new ConfigError(`Invalid value for ${name}: "${raw}" (expected true/false)`);
}

export function loadConfig(): MuxMcpConfig {
  const tmuxSocket = process.env["MUX_MCP_TMUX_SOCKET"] || "mux-mcp";

  let model: ModelConfig | null = null;
  const baseUrl = process.env["MUX_MCP_MODEL_BASE_URL"];
  const apiKey = process.env["MUX_MCP_MODEL_API_KEY"];
  const modelName = process.env["MUX_MCP_MODEL_NAME"];

  if (baseUrl && apiKey && modelName) {
    model = {
      baseUrl,
      apiKey,
      model: modelName,
      maxTokens: envInt("MUX_MCP_MODEL_MAX_TOKENS", 1024),
      temperature: parseFloat(process.env["MUX_MCP_MODEL_TEMPERATURE"] || "0.3"),
    };
  }

  return Object.freeze({
    tmuxSocket,
    maxSessions: envInt("MUX_MCP_MAX_SESSIONS", 10),
    captureLines: envInt("MUX_MCP_CAPTURE_LINES", 500),
    outputMaxBytes: envInt("MUX_MCP_OUTPUT_MAX_BYTES", 51200),
    verifyTimeout: envInt("MUX_MCP_VERIFY_TIMEOUT", 30000),
    verifyPollInterval: envInt("MUX_MCP_VERIFY_POLL_INTERVAL", 1000),
    stripAnsi: envBool("MUX_MCP_STRIP_ANSI", true),
    model,
  });
}
