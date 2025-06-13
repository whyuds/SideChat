# SideChat Extension

A side panel chat extension for VSCode, TraeAI, Cursor and other AI code editors. Configure the corresponding MCPServer to maintain continuous communication with users during a single code generation process.

## Installation Steps
Add the following MCP service configuration to the AI code editor MCP configuration, and enable it in the Agent

```json
{
  "mcpServers": {
    "Notify": {
      "command": "npx",
      "args": ["notify-mcp"]
    }
  }
}
```

## Usage

### Chat Panel Features

When receiving a notification that requires a reply, VSCode will:

1. **Automatically Open Chat Panel**: Display a dedicated conversation window on the right
2. **Show Waiting Status**: Status bar displays "⏳ Waiting for reply..." prompt
3. **Retain History**: Display historical conversations of all notifications and replies
4. **Support Multi-line Input**:
   - `Shift + Enter`: Line break
   - `Enter`: Send message
5. **Intelligent Status Management**: Automatically hide waiting status after sending a reply
6. **Auto-hide Window**: Automatically close the chat panel 1 second after the reply is sent

#### Manually Open Chat Panel

- Use command palette: `Ctrl+Shift+P` → Search for "Open SideChat Panel"
- Click the notification icon in the status bar (if there are messages waiting for reply)

## License

MIT License