# VSCode SideChat CLI & MCP Server

Working with SideChat extension for Cursor, TraeAI, VSCode and other editors, allowing AI to maintain communication with users throughout the code generation process

## Extension Usage
Search for "SideChat" in the VSCode Extensions Marketplace. 
Or download it from here:https://github.com/whyuds/SideChat/releases

## MCP Server Usage

This package also provides an MCP (Model Context Protocol) server that can be integrated with AI assistants.

### MCP Configuration

Add the following to your MCP client configuration:

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

### Available MCP Tools

#### send_notification

Sends a notification to VSCode.

**Parameters:**
- `message` (required): The notification message to display

**Default Settings:**
- Title: "VSCode Notification"
- Buttons: ["Continue", "Reply"]
- Timeout: 300 seconds (5 minutes)

**Example:**
```json
{
  "name": "send_notification",
  "arguments": {
    "message": "Hello from MCP!"
  }
}
```

## CLI Usage

```bash
npm install -g notify-mcp
```

```bash
# Basic usage
notify "Hello World"

# With options
notify -t "Important" -m "Please confirm" -b "Yes,No,Cancel"
notify --title "Question" --message "Do you agree?" --buttons "Yes,No"
```

### CLI Options

- `-t, --title <title>`: Notification title (default: "VSCode Notification")
- `-m, --message <message>`: Notification message
- `-b, --buttons <buttons>`: Comma-separated list of buttons (default: "Continue,Reply")
- `--timeout <seconds>`: Timeout in seconds (default: 300)
- `-h, --help`: Show help message

## Requirements

- Node.js
- VSCode with the corresponding notification extension installed

## License

MIT