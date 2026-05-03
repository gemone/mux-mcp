export interface SessionData {
  readonly sessionName: string;
  readonly command: string;
  readonly createdAt: string;
  readonly autoDestroy: boolean;
  captured: boolean;
}

export class Session implements SessionData {
  readonly sessionName: string;
  readonly command: string;
  readonly createdAt: string;
  readonly autoDestroy: boolean;
  captured = false;

  constructor(sessionName: string, command: string, autoDestroy: boolean = false) {
    this.sessionName = sessionName;
    this.command = command;
    this.createdAt = new Date().toISOString();
    this.autoDestroy = autoDestroy;
  }

  markCaptured(): void {
    this.captured = true;
  }

  shouldAutoDestroy(): boolean {
    return this.autoDestroy && this.captured;
  }
}
