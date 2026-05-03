const ANSI_REGEX =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()[\]#8;]|[\x00-\x08\x0e\x0f]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "");
}
