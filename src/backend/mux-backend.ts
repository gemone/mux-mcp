export interface LaunchResult {
  sessionName: string;
  command: string;
  success: boolean;
}

export interface CaptureResult {
  sessionName: string;
  content: string;
  lineCount: number;
  truncated: boolean;
  capturedAt: string;
}

export interface SendKeysResult {
  sessionName: string;
  keys: string;
  success: boolean;
}

export interface VerifyResult {
  sessionName: string;
  passed: boolean;
  assertions: AssertionResult[];
  capturedOutput: string;
  exitCode: number;
  verifiedAt: string;
}

export interface AssertionResult {
  type: "exitCode" | "outputContains" | "outputRegex" | "outputExact";
  expected: string | number;
  passed: boolean;
  message: string;
}

export interface SessionInfo {
  sessionName: string;
  alive: boolean;
  command: string;
  createdAt: string;
  captured: boolean;
}

export interface MuxBackend {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  launch(
    sessionName: string,
    command: string,
    workingDir?: string,
    env?: Record<string, string>,
  ): Promise<LaunchResult>;
  capture(
    sessionName: string,
    lines?: number,
    stripAnsi?: boolean,
  ): Promise<CaptureResult>;
  sendKeys(
    sessionName: string,
    keys: string,
    literal?: boolean,
  ): Promise<SendKeysResult>;
  isAlive(sessionName: string): Promise<boolean>;
  getSessionInfo(sessionName: string): Promise<SessionInfo>;
  listSessions(): Promise<SessionInfo[]>;
  destroy(sessionName: string): Promise<void>;
  destroyAll(): Promise<void>;
}
