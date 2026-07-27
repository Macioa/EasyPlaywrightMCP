# Install EasyPlaywrightMCP in Claude Code CLI

1. Build:

```bash
cd C:\Users\tsell\OneDrive\Documents\GitHub\EasyPlaywrightMCP
npm install
npm run build
```

2. Register with Claude Code:

```bash
claude mcp add EasyPlaywrightMCP -- node "C:/Users/tsell/OneDrive/Documents/GitHub/EasyPlaywrightMCP/dist/index.js"
```

Scope options (if supported by your CLI version):

```bash
claude mcp add --scope user EasyPlaywrightMCP -- node "C:/Users/tsell/OneDrive/Documents/GitHub/EasyPlaywrightMCP/dist/index.js"
```

3. Verify:

```bash
claude mcp list
```

Or inspect project `.mcp.json` / user MCP config for the `EasyPlaywrightMCP` entry.

## Manual config

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
