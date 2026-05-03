export type MuxBackendName = "tmux" | "zellij";

export type OutputFormat = "json" | "yaml" | "md";

export interface Formattable {
  [key: string]: unknown;
}
