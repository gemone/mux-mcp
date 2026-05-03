import type { OutputFormat, Formattable } from "../types.js";
import { FormatError } from "../errors/index.js";

function toYaml(data: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (data === null || data === undefined) return `${pad}null`;
  if (typeof data === "boolean") return `${pad}${data}`;
  if (typeof data === "number") return `${pad}${data}`;
  if (typeof data === "string") {
    if (data.includes("\n") || data.includes(":") || data.includes("#") || data.startsWith('"') || data.includes("'")) {
      const escaped = data.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${pad}"${escaped}"`;
    }
    return `${pad}${data}`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return `${pad}[]`;
    const lines: string[] = [];
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        lines.push(`${pad}-`);
        for (const [key, value] of Object.entries(item)) {
          lines.push(toYaml(value, indent + 2).replace(`${"  ".repeat(indent + 2)}`, `${"  ".repeat(indent + 2)}${key}: `));
        }
      } else {
        const val = toYaml(item, 0).trim();
        lines.push(`${pad}- ${val}`);
      }
    }
    return lines.join("\n");
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    const lines: string[] = [];
    for (const [key, value] of entries) {
      if (value === null || value === undefined) {
        lines.push(`${pad}${key}: null`);
      } else if (typeof value === "object" && !Array.isArray(value)) {
        lines.push(`${pad}${key}:`);
        lines.push(toYaml(value, indent + 1));
      } else if (Array.isArray(value) && value.length > 0) {
        lines.push(`${pad}${key}:`);
        lines.push(toYaml(value, indent + 1));
      } else {
        const val = toYaml(value, 0).trim();
        lines.push(`${pad}${key}: ${val}`);
      }
    }
    return lines.join("\n");
  }

  return `${pad}${String(data)}`;
}

function toMarkdown(data: Formattable, title?: string): string {
  // Detect shape and format accordingly
  if ("sessionName" in data && "passed" in data && "assertions" in data) {
    return formatVerifyMd(data);
  }
  if ("sessionName" in data && "content" in data && "capturedAt" in data) {
    return formatCaptureMd(data);
  }
  if ("sessionName" in data && "command" in data && "createdAt" in data && !("sessions" in data)) {
    return formatLaunchMd(data);
  }
  if ("sessions" in data && "count" in data) {
    return formatSessionListMd(data);
  }
  if ("diagnosis" in data) {
    return formatDiagnoseMd(data);
  }
  if ("formatted" in data && "format" in data) {
    return formatConvertMd(data);
  }
  // Generic fallback
  return formatGenericMd(data, title);
}

function formatLaunchMd(data: Formattable): string {
  return `## Session Launched

| Field | Value |
|-------|-------|
| Session | \`${data.sessionName}\` |
| Command | \`${data.command}\` |
| Auto Destroy | ${data.autoDestroy ?? false} |
| Created | ${data.createdAt} |`;
}

function formatCaptureMd(data: Formattable): string {
  const truncated = data.truncated ? "yes" : "no";
  return `## Screen Capture: \`${data.sessionName}\`

Captured ${data.lineCount} lines at ${data.capturedAt} (truncated: ${truncated})

\`\`\`
${data.content}
\`\`\``;
}

function formatVerifyMd(data: Formattable): string {
  const passed = data.passed as boolean;
  const assertions = data.assertions as Array<{
    type: string;
    expected: string | number;
    passed: boolean;
    message: string;
  }>;
  const status = passed ? "PASSED" : "FAILED";

  let md = `## Verification: \`${data.sessionName}\` -- ${status}

| Assertion | Expected | Result |
|-----------|----------|--------|`;

  for (const a of assertions) {
    const result = a.passed ? "PASS" : "FAIL";
    md += `\n| ${a.type} | ${a.expected} | ${result} |`;
  }

  md += `\n\n### Captured Output

\`\`\`
${data.capturedOutput}
\`\`\``;

  return md;
}

function formatSessionListMd(data: Formattable): string {
  const sessions = data.sessions as Array<{
    sessionName: string;
    alive: boolean;
    command: string;
    captured: boolean;
    createdAt: string;
  }>;

  let md = `## Active Sessions (${data.count})

| Session | Command | Alive | Captured | Created |
|---------|---------|-------|----------|---------|`;

  for (const s of sessions) {
    md += `\n| ${s.sessionName} | ${s.command} | ${s.alive ? "yes" : "no"} | ${s.captured ? "yes" : "no"} | ${s.createdAt} |`;
  }

  return md;
}

function formatDiagnoseMd(data: Formattable): string {
  return `## Diagnosis: \`${data.sessionName}\`

**Model**: ${data.model}
**Diagnosed at**: ${data.diagnosedAt}

${data.diagnosis}

### Captured Output

\`\`\`
${data.capturedOutput}
\`\`\``;
}

function formatConvertMd(data: Formattable): string {
  return `## Format Conversion

**Format**: ${data.format}

\`\`\`
${data.formatted}
\`\`\``;
}

function formatGenericMd(data: Formattable, title?: string): string {
  const heading = title ? `## ${title}` : "## Result";
  const lines = [heading, ""];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object") {
      lines.push(`**${key}**:`);
      lines.push("```json");
      lines.push(JSON.stringify(value, null, 2));
      lines.push("```");
    } else {
      lines.push(`**${key}**: ${value}`);
    }
  }
  return lines.join("\n");
}

export function convertFormat(
  data: Formattable,
  format: OutputFormat,
  title?: string,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "yaml":
      return toYaml(data);
    case "md":
      return toMarkdown(data, title);
    default:
      throw new FormatError(`Unknown format: ${format}`);
  }
}
