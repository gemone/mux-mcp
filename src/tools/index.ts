import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend } from "../backend/mux-backend.js";
import { registerMuxLaunch } from "./mux-launch.js";
import { registerMuxCapture } from "./mux-capture.js";
import { registerMuxVerify } from "./mux-verify.js";
import { registerMuxSendKeys } from "./mux-send-keys.js";
import { registerMuxListSessions } from "./mux-list-sessions.js";
import { registerMuxDestroySession } from "./mux-destroy-session.js";
import { registerMuxConvertFormat } from "./mux-convert-format.js";
import { registerMuxDiagnose } from "../diagnose/index.js";

export function registerTools(
  server: McpServer,
  sessionManager: SessionManager,
  backends: Record<string, MuxBackend>,
  config: MuxMcpConfig,
): void {
  registerMuxLaunch(server, sessionManager, backends, config);
  registerMuxCapture(server, sessionManager, backends, config);
  registerMuxVerify(server, sessionManager, backends, config);
  registerMuxSendKeys(server, sessionManager, backends);
  registerMuxListSessions(server, sessionManager);
  registerMuxDestroySession(server, sessionManager, backends);
  registerMuxConvertFormat(server);
  registerMuxDiagnose(server, sessionManager, backends, config);
}
