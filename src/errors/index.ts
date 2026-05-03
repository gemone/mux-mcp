export class MuxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MuxError";
  }
}

export class SessionNotFoundError extends MuxError {
  constructor(sessionName: string) {
    super("SESSION_NOT_FOUND", `Session "${sessionName}" not found`, { sessionName });
    this.name = "SessionNotFoundError";
  }
}

export class SessionLimitError extends MuxError {
  constructor(limit: number) {
    super("SESSION_LIMIT", `Maximum concurrent sessions (${limit}) reached`, { limit });
    this.name = "SessionLimitError";
  }
}

export class BackendError extends MuxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BACKEND_ERROR", message, details);
    this.name = "BackendError";
  }
}

export class TimeoutError extends MuxError {
  constructor(operation: string, timeoutMs: number) {
    super("TIMEOUT", `Operation "${operation}" timed out after ${timeoutMs}ms`, {
      operation,
      timeoutMs,
    });
    this.name = "TimeoutError";
  }
}

export class ConfigError extends MuxError {
  constructor(message: string) {
    super("CONFIG_ERROR", message);
    this.name = "ConfigError";
  }
}

export class NotImplementedError extends MuxError {
  constructor(feature: string) {
    super("NOT_IMPLEMENTED", `${feature} is not yet implemented`);
    this.name = "NotImplementedError";
  }
}

export class FormatError extends MuxError {
  constructor(message: string) {
    super("FORMAT_ERROR", message);
    this.name = "FormatError";
  }
}
