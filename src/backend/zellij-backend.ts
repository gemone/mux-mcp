import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

export class ZellijBackend implements MuxBackend {
  readonly name = "zellij";

  private async zellij(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync("zellij", args, {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; stderr?: string };
      if (error.code === "ENOENT") {
        throw new BackendError("zellij is not installed or not in PATH");
      }
      throw new BackendError(`zellij command failed: ${error.message}`, {
        stderr: error.stderr,
        args,
      });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await this.zellij("--version");
      const match = stdout.match(/zellij (\d+)\.(\d+)/);
      if (!match) return false;
      const major = parseInt(match[1]!, 10);
      return major >= 0;
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
    const args = ["--session", sessionName, "--"];
    if (workingDir) {
      // zellij doesn't have a direct --cwd for detached sessions;
      // we wrap with cd
      const envPrefix = env
        ? Object.entries(env)
            .map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
            .join(" ")
        : "";
      const wrapped = `cd ${JSON.stringify(workingDir)} && ${envPrefix} exec ${command}`;
      args.push("sh", "-c", wrapped);
    } else if (env) {
      const envPrefix = Object.entries(env)
        .map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
        .join(" ");
      args.push("sh", "-c", `${envPrefix} exec ${command}`);
    } else {
      args.push("sh", "-c", command);
    }

    // zellij doesn't have a clean --detach for new-session from CLI
    // Use --session with background process
    try {
      await execFileAsync("zellij", ["--session", sessionName, "action", "new-tab", "--name", "main"], {
        timeout: 5000,
      }).catch(() => {
        // Session might not exist yet, that's fine
      });

      // Create session with the command
      const fullArgs = ["--session", sessionName];
      if (workingDir) {
        const envPrefix = env
          ? Object.entries(env)
              .map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
              .join(" ")
          : "";
        fullArgs.push("exec", "--", "sh", "-c", `cd ${JSON.stringify(workingDir)} && ${envPrefix} exec ${command}`);
      } else if (env) {
        const envPrefix = Object.entries(env)
          .map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
          .join(" ");
        fullArgs.push("exec", "--", "sh", "-c", `${envPrefix} exec ${command}`);
      } else {
        fullArgs.push("exec", "--", "sh", "-c", command);
      }

      // Start zellij session in background
      execFileAsync("zellij", ["--session", sessionName], {
        timeout: 2000,
      }).catch(() => {
        // Expected to timeout or fail since we want it detached
      });

      // Give it a moment to start
      await new Promise((r) => setTimeout(r, 500));

      // Send the command via action
      await this.zellij(
        "--session",
        sessionName,
        "action",
        "write-chars",
        `${command}\n`,
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      throw new BackendError(`Failed to launch zellij session: ${error.message}`);
    }

    return { sessionName, command, success: true };
  }

  async capture(
    sessionName: string,
    _lines?: number,
    stripAnsi?: boolean,
  ): Promise<CaptureResult> {
    // scrollback lines used for future zellij implementation
    let content: string;
    try {
      // zellij doesn't have a direct capture-pane equivalent in CLI
      // Use dump-screen or plugin-based approach
      const { stdout } = await this.zellij(
        "--session",
        sessionName,
        "action",
        "dump-screen",
        "/dev/stdout",
      );
      content = stdout;
    } catch {
      // Fallback: try to capture via the session's output
      try {
        const { stdout } = await execFileAsync("zellij", [
          "--session",
          sessionName,
          "action",
          "dump-screen",
          "-",
        ], { timeout: 5000 });
        content = stdout;
      } catch {
        content = "";
      }
    }

    const shouldStrip = stripAnsi !== false;
    const processed = shouldStrip ? stripAnsiFn(content) : content;
    const lineCount = processed.split("\n").length;

    return {
      sessionName,
      content: processed,
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
    try {
      if (literal) {
        await this.zellij(
          "--session",
          sessionName,
          "action",
          "write-chars",
          keys,
        );
      } else {
        // For special keys, use write with escape sequences
        await this.zellij(
          "--session",
          sessionName,
          "action",
          "write",
          keys,
        );
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      throw new BackendError(`Failed to send keys: ${error.message}`);
    }
    return { sessionName, keys, success: true };
  }

  async isAlive(sessionName: string): Promise<boolean> {
    try {
      const { stdout } = await this.zellij("list-sessions");
      return stdout.includes(sessionName);
    } catch {
      return false;
    }
  }

  async getSessionInfo(sessionName: string): Promise<SessionInfo> {
    try {
      const { stdout } = await this.zellij("list-sessions");
      const alive = stdout.includes(sessionName);
      return {
        sessionName,
        alive,
        command: "unknown",
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
      const { stdout } = await this.zellij("list-sessions");
      if (!stdout.trim()) return [];
      // Parse zellij list-sessions output (format: session_name (created) [attached/detached])
      const lines = stdout.trim().split("\n");
      const sessions: SessionInfo[] = [];
      for (const line of lines) {
        const match = line.match(/^(\S+)/);
        if (match && match[1]!.startsWith("mux-mcp-")) {
          sessions.push({
            sessionName: match[1]!,
            alive: true,
            command: "unknown",
            createdAt: new Date().toISOString(),
            captured: false,
          });
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  async destroy(sessionName: string): Promise<void> {
    try {
      await this.zellij("kill-session", "--session", sessionName);
    } catch {
      // Session may already be gone — idempotent
    }
  }

  async destroyAll(): Promise<void> {
    try {
      const sessions = await this.listSessions();
      for (const session of sessions) {
        try {
          await this.zellij("kill-session", "--session", session.sessionName);
        } catch {
          // Best effort
        }
      }
    } catch {
      // No sessions — fine
    }
  }
}
