# mux-mcp

MCP server for testing and verification of TUI and CLI programs via tmux & zellij.

## Overview

mux-mcp is a [Model Context Protocol](https://modelcontextprotocol.io/) server that lets AI agents and automation tools launch, interact with, and verify terminal programs. It runs commands inside tmux or zellij sessions, captures their output, sends keystrokes, and asserts expected behavior — all through a set of MCP tools.

## Requirements

- Node.js >= 18
- At least one of:
  - tmux >= 3.x (primary, full feature support)
  - zellij >= 0.x (secondary, limited exit code support)

## Installation

```bash
npm install -g mux-mcp
```

Or run directly:

```bash
npx mux-mcp
```

## MCP Configuration

### Claude Code

Using the CLI:

```bash
# Add to current project
claude mcp add mux mux-mcp

# Add with environment variables
claude mcp add mux -e MUX_MCP_MAX_SESSIONS=20 -e MUX_MCP_VERIFY_TIMEOUT=60000 mux-mcp

# Add globally (available in all projects)
claude mcp add --global mux mux-mcp
```

Or create a `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "mux": {
      "command": "mux-mcp",
      "args": [],
      "type": "stdio"
    }
  }
}
```

### Claude Desktop / Cursor / Other MCP Clients

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "mux": {
      "command": "mux-mcp",
      "env": {
        "MUX_MCP_MAX_SESSIONS": "20",
        "MUX_MCP_VERIFY_TIMEOUT": "60000"
      }
    }
  }
}
```

Or use `npx` if not installed globally:

```json
{
  "mcpServers": {
    "mux": {
      "command": "npx",
      "args": ["mux-mcp"]
    }
  }
}
```

## Tools

### `mux_launch`

Launch a command in a new terminal session.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `command` | string | **required** | Shell command to run |
| `sessionName` | string | auto-generated | Session identifier |
| `workingDir` | string | current dir | Working directory |
| `env` | object | — | Environment variables |
| `backend` | `"tmux"` \| `"zellij"` | `"tmux"` | Terminal multiplexer |
| `autoDestroy` | boolean | `false` | Destroy session after first capture/verify |

### `mux_capture`

Capture the current screen content of a session.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionName` | string | **required** | Session to capture |
| `lines` | number | `500` | Scrollback lines to capture |
| `stripAnsi` | boolean | `true` | Strip ANSI escape codes |

### `mux_verify`

Capture output and verify against assertions. Polls until assertions pass or timeout.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionName` | string | **required** | Session to verify |
| `exitCode` | number | — | Expected exit code |
| `outputContains` | string | — | Substring to find in output |
| `outputRegex` | string | — | Regex to match against output |
| `outputExact` | string | — | Exact string match |
| `timeout` | number | `30000` | Assertion timeout in ms |
| `pollInterval` | number | `1000` | Polling interval in ms |

### `mux_send_keys`

Send key input to a running session.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionName` | string | **required** | Target session |
| `keys` | string | **required** | Key names (tmux format: `Enter`, `C-c`, `Space`, etc.) |
| `literal` | boolean | `false` | Send as literal text vs. interpreted keys |

### `mux_list_sessions`

List all active mux-mcp sessions. No parameters.

### `mux_destroy_session`

Destroy a session and clean up resources.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionName` | string | **required** | Session to destroy |

### `mux_convert_format`

Convert output data between formats (JSON, YAML, Markdown).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | string | **required** | JSON string to convert |
| `targetFormat` | `"json"` \| `"yaml"` \| `"md"` | **required** | Output format |
| `title` | string | — | Optional title for markdown output |

### `mux_diagnose`

Use an LLM to diagnose why a command is failing. Requires model configuration (see Environment Variables).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionName` | string | **required** | Session to diagnose |
| `question` | string | — | Specific question about the failure |
| `lines` | number | `500` | Output lines to analyze |

All tools accept an optional `format` parameter (`"json"` | `"yaml"` | `"md"`) to control output format.

## Environment Variables

All optional with sensible defaults.

### General

| Variable | Default | Description |
|----------|---------|-------------|
| `MUX_MCP_TMUX_SOCKET` | `"mux-mcp"` | tmux socket name for session isolation |
| `MUX_MCP_MAX_SESSIONS` | `10` | Maximum concurrent sessions |
| `MUX_MCP_CAPTURE_LINES` | `500` | Default scrollback lines to capture |
| `MUX_MCP_OUTPUT_MAX_BYTES` | `51200` | Max output size before truncation (bytes) |
| `MUX_MCP_STRIP_ANSI` | `true` | Strip ANSI escape codes from output |

### Verification

| Variable | Default | Description |
|----------|---------|-------------|
| `MUX_MCP_VERIFY_TIMEOUT` | `30000` | Default verify timeout in ms |
| `MUX_MCP_VERIFY_POLL_INTERVAL` | `1000` | Default verify polling interval in ms |

### LLM Diagnosis

All three are required for `mux_diagnose` to work.

| Variable | Default | Description |
|----------|---------|-------------|
| `MUX_MCP_MODEL_BASE_URL` | — | OpenAI-compatible API base URL |
| `MUX_MCP_MODEL_API_KEY` | — | API key |
| `MUX_MCP_MODEL_NAME` | — | Model name |
| `MUX_MCP_MODEL_MAX_TOKENS` | `1024` | Max tokens per request |
| `MUX_MCP_MODEL_TEMPERATURE` | `0.3` | Sampling temperature |

## Example Workflow

```text
1. mux_launch  — start your CLI app in a session
2. mux_capture — inspect the initial output
3. mux_send_keys — type input, press Enter, navigate
4. mux_verify — assert expected output or exit code
5. mux_destroy_session — clean up (or use autoDestroy)
```

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (with tsx)
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint
```

## License

MIT
