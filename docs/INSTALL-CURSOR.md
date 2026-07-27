# Install EasyPlaywrightMCP in Cursor (IDE)

1. Build the server:

```bash
cd C:\Users\tsell\OneDrive\Documents\GitHub\EasyPlaywrightMCP
npm install
npm run build
```

2. Open **Cursor Settings → MCP** (or edit your MCP config file) and add:

```json
{
  "mcpServers": {
    "EasyPlaywrightMCP": {
      "command": "node",
      "args": [
        "C:/Users/tsell/OneDrive/Documents/GitHub/EasyPlaywrightMCP/dist/index.js"
      ]
    }
  }
}
```

Typical config paths:

- Project: `.cursor/mcp.json`
- User: `%USERPROFILE%\.cursor\mcp.json`

3. Restart Cursor (or reload MCP servers). Confirm tools: `login`, `set_session_auth`, `start_session`, `query_sessions`, `query_session`, `orchestrate_session`, `end_session`, `compile_demo`.

## Prerequisites

- `ffmpeg` / `ffprobe` on PATH (`winget install Gyan.FFmpeg`)
- `python -m pip install edge-tts` (for `compile_demo`)
