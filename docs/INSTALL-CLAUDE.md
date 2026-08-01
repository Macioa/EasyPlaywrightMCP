# Install EasyPlaywrightMCP in Claude Desktop

1. Build:

```bash
cd C:\Users\tsell\OneDrive\Documents\GitHub\EasyPlaywrightMCP
npm install
npm run build
```

2. Edit Claude Desktop config:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

3. Fully quit and relaunch Claude Desktop. Open a new chat and confirm the EasyPlaywrightMCP tools appear.

## Prerequisites

- Node 20+ on PATH for the `node` command Claude launches
- Platform A/V tools — see [platform-tools.md](platform-tools.md) (`ffmpeg` / `ffprobe`, Python + `edge-tts`)
