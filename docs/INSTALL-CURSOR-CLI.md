# Install EasyPlaywrightMCP in Cursor CLI

1. Build:

```bash
cd C:\Users\tsell\OneDrive\Documents\GitHub\EasyPlaywrightMCP
npm install
npm run build
```

2. Add the MCP server with the Cursor CLI (adjust if your CLI uses a different subcommand):

```bash
cursor mcp add EasyPlaywrightMCP -- node "C:/Users/tsell/OneDrive/Documents/GitHub/EasyPlaywrightMCP/dist/index.js"
```

Or write `%USERPROFILE%\.cursor\mcp.json`:

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

3. Verify:

```bash
cursor mcp list
```

You should see `EasyPlaywrightMCP` with the seven tools available in agent sessions.
