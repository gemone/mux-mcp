import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MuxMcpConfig } from "../config.js";
import { BackendError } from "../errors/index.js";
import { stripAnsi as stripAnsiFn } from "../ansi/strip.js";
import type {
  MuxBackend,
  LaunchResult,
  CaptureResult,
  SendKeysResult,
  SessionInfo,
} from "./mux-backend.js";

const execFileAsync = promisify(execFile);

export class TmuxBackend implements MuxBackend {
  readonly name = "tmux";
  private readonly socket: string;

  constructor(config: MuxMcpConfig) {
    this.socket = config.tmuxSocket;
  }

  private async tmux(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync("tmux", ["-L", this.socket, ...args], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; stderr?: string };
      if (error.code === "ENOENT") {
        throw new BackendError("tmux is not installed or not in PATH");
      }
      throw new BackendError(`tmux command failed: ${error.message}`, {
        stderr: error.stderr,
        args,
      });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await this.tmux("-V");
      const match = stdout.match(/tmux (\d+)\.(\d+)/);
      if (!match) return false;
      const major = parseInt(match[1]!, 10);
      return major >= 3;
    } catch {
      return false;
    }
  }

  async launch(
    sessionName: string,
    command: string,
    workingDir?: string,
    env?: Record<string, string>,
  ): Promise<LaunchResult> {
    const args = ["new-session", "-d", "-s", sessionName];
    if (workingDir) {
      args.push("-c", workingDir);
    }
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        args.push("-e", `${key}=${value}`);
      }
    }
    // Wrap command to: (1) run in subshell to survive exit N, (2) capture exit code via sentinel, (3) keep session alive
    const wrappedCommand = `( ${command} ); MUX_EXIT=$?; echo "MUX_MCP_EXIT_CODE:$MUX_EXIT"; exec cat`;
    args.push("--", "sh", "-c", wrappedCommand);
    await this.tmux(...args);
    return { sessionName, command, success: true };
  }

  async capture(
    sessionName: string,
    lines?: number,
    stripAnsi?: boolean,
  ): Promise<CaptureResult> {
    const scrollback = lines ?? 500;
    const { stdout } = await this.tmux(
      "capture-pane",
      "-t",
      sessionName,
      "-p",
      "-S",
      `-${scrollback}`,
    );
    const shouldStrip = stripAnsi !== false;
    const cleaned = stdout.replace(/MUX_MCP_EXIT_CODE:\d+\n?/g, "");
    const content = shouldStrip ? stripAnsiFn(cleaned) : cleaned;
    const lineCount = content.split("\n").length;
    return {
      sessionName,
      content,
      lineCount,
      truncated: false,
      capturedAt: new Date().toISOString(),
    };
  }

  async sendKeys(
    sessionName: string,
    keys: string,
    literal?: boolean,
  ): Promise<SendKeysResult> {
    const args = ["send-keys", "-t", sessionName];
    if (literal) args.push("-l");
    args.push(keys);
    await this.tmux(...args);
    return { sessionName, keys, success: true };
  }

  async isAlive(sessionName: string): Promise<boolean> {
    try {
      await this.tmux("has-session", "-t", sessionName);
      return true;
    } catch {
      return false;
    }
  }

  async getSessionInfo(sessionName: string): Promise<SessionInfo> {
    try {
      const { stdout } = await this.tmux(
        "list-panes",
        "-t",
        sessionName,
        "-F",
        "#{pane_pid},#{pane_current_command}",
      );
      const firstLine = stdout.trim().split("\n")[0] ?? "";
      const [, command] = firstLine.split(",", 2);
      return {
        sessionName,
        alive: true,
        command: command ?? "unknown",
        createdAt: new Date().toISOString(),
        captured: false,
      };
    } catch {
      return {
        sessionName,
        alive: false,
        command: "",
        createdAt: new Date().toISOString(),
        captured: false,
      };
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const { stdout } = await this.tmux("list-sessions", "-F", "#{session_name}");
      if (!stdout.trim()) return [];
      const names = stdout
        .trim()
        .split("\n")
        .filter((n) => n.startsWith("mux-mcp-"));
      const sessions: SessionInfo[] = [];
      for (const name of names) {
        sessions.push(await this.getSessionInfo(name));
      }
      return sessions;
    } catch {
      return [];
    }
  }

  async destroy(sessionName: string): Promise<void> {
    try {
      await this.tmux("kill-session", "-t", sessionName);
    } catch {
      // Session may already be gone — idempotent
    }
  }

  async destroyAll(): Promise<void> {
    try {
      const { stdout } = await this.tmux("list-sessions", "-F", "#{session_name}");
      if (!stdout.trim()) return;
      const names = stdout
        .trim()
        .split("\n")
        .filter((n) => n.startsWith("mux-mcp-"));
      for (const name of names) {
        try {
          await this.tmux("kill-session", "-t", name);
        } catch {
          // Best effort
        }
      }
    } catch {
      // No sessions at all — fine
    }
  }

  async getExitCode(sessionName: string): Promise<number> {
    try {
      // Try pane_dead_status first (for sessions where command already exited)
      const { stdout: paneStatus } = await this.tmux(
        "list-panes",
        "-t",
        sessionName,
        "-F",
        "#{pane_dead_status}",
      );
      const status = paneStatus.trim();
      if (status !== "" && status !== "-") {
        const code = parseInt(status, 10);
        if (!isNaN(code)) return code;
      }

      // Fallback: parse sentinel from captured output
      const { stdout: capture } = await this.tmux(
        "capture-pane",
        "-t",
        sessionName,
        "-p",
        "-S",
        "-100",
      );
      const match = capture.match(/MUX_MCP_EXIT_CODE:(\d+)/);
      if (match) {
        return parseInt(match[1]!, 10);
      }

      return -1;
    } catch {
      return -1;
    }
  }
}
