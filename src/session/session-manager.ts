import { randomBytes } from "node:crypto";
import type { MuxMcpConfig } from "../config.js";
import type { MuxBackend, SessionInfo } from "../backend/mux-backend.js";
import { SessionLimitError, SessionNotFoundError } from "../errors/index.js";
import { Session } from "./session.js";
import { SessionMutex } from "./session-mutex.js";

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly mutexes = new Map<string, SessionMutex>();
  private readonly backend: MuxBackend;
  private readonly maxSessions: number;

  constructor(backend: MuxBackend, config: MuxMcpConfig) {
    this.backend = backend;
    this.maxSessions = config.maxSessions;
  }

  generateName(): string {
    const hex = randomBytes(4).toString("hex");
    return `mux-mcp-${hex}`;
  }

  ensurePrefix(name: string): string {
    return name.startsWith("mux-mcp-") ? name : `mux-mcp-${name}`;
  }

  createSession(
    sessionName: string,
    command: string,
    autoDestroy: boolean = false,
  ): Session {
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionLimitError(this.maxSessions);
    }
    if (this.sessions.has(sessionName)) {
      throw new SessionLimitError(this.maxSessions);
    }
    const session = new Session(sessionName, command, autoDestroy);
    this.sessions.set(sessionName, session);
    this.mutexes.set(sessionName, new SessionMutex());
    return session;
  }

  getSession(sessionName: string): Session {
    const session = this.sessions.get(sessionName);
    if (!session) {
      throw new SessionNotFoundError(sessionName);
    }
    return session;
  }

  hasSession(sessionName: string): boolean {
    return this.sessions.has(sessionName);
  }

  getMutex(sessionName: string): SessionMutex {
    let mutex = this.mutexes.get(sessionName);
    if (!mutex) {
      mutex = new SessionMutex();
      this.mutexes.set(sessionName, mutex);
    }
    return mutex;
  }

  removeSession(sessionName: string): void {
    this.sessions.delete(sessionName);
    this.mutexes.delete(sessionName);
  }

  async destroySession(sessionName: string): Promise<boolean> {
    const session = this.sessions.get(sessionName);
    if (!session) return false;
    try {
      await this.backend.destroy(sessionName);
    } catch {
      // Best effort
    }
    this.removeSession(sessionName);
    return true;
  }

  async destroyAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    for (const name of names) {
      await this.destroySession(name);
    }
    // Also clean up any orphaned backend sessions
    await this.backend.destroyAll();
  }

  async listBackendSessions(): Promise<SessionInfo[]> {
    const backendSessions = await this.backend.listSessions();
    return backendSessions.map((bs) => {
      const internal = this.sessions.get(bs.sessionName);
      return {
        ...bs,
        createdAt: internal?.createdAt ?? bs.createdAt,
        captured: internal?.captured ?? false,
      };
    });
  }

  get count(): number {
    return this.sessions.size;
  }
}
