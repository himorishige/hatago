# External MCP Clock Server

Simple external MCP server providing clock and timezone functionality for testing Hatago's external MCP connection system.

## Features

- **clock.getTime** - Get current time in various formats and timezones
- **clock.getTimezone** - Get timezone information and list available timezones
- Health check endpoint
- JSON API documentation

## Quick Start

### 1. Install Dependencies

```bash
cd examples/external-mcp-clock
npm install
```

### 2. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

Server runs on: http://localhost:8788

### 3. Test the Server

```bash
# Health check
curl http://localhost:8788/health

# Server info
curl http://localhost:8788/

# MCP tools list
curl -X POST http://localhost:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Available Tools

### clock.getTime

Get current time in various formats and timezones.

**Parameters:**

- `timezone` (string, optional): Timezone identifier (default: "UTC")
- `format` (string, optional): Output format - "iso", "locale", "unix" (default: "iso")

**Example:**

```bash
curl -X POST http://localhost:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"clock.getTime",
      "arguments":{"timezone":"America/New_York","format":"locale"}
    }
  }'
```

### clock.getTimezone

Get timezone information and list available timezones.

**Parameters:**

- `timezone` (string, optional): Specific timezone to get info about
- `list` (boolean, optional): Return list of common timezones (default: false)

**Example:**

```bash
curl -X POST http://localhost:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"clock.getTimezone",
      "arguments":{"list":true}
    }
  }'
```

## Use with Hatago

This server can be connected to Hatago using the external MCP connection system:

### 1. Add to Hatago Configuration

Create or update `hatago.config.json`:

```json
{
  "externalMcp": {
    "servers": [
      {
        "id": "clock-server",
        "endpoint": "http://localhost:8788",
        "namespace": "clock",
        "policies": {
          "cache": { "toolsTTL": 300000 },
          "timeout": { "connect": 3000, "call": 15000 }
        }
      }
    ]
  }
}
```

### 2. Use from Hatago

Once connected, the tools will be available as:

- `clock.getTime` → `clock.clock.getTime`
- `clock.getTimezone` → `clock.clock.getTimezone`

## Development

### Project Structure

```
external-mcp-clock/
├── src/
│   └── server.ts          # Main MCP server implementation
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

### Technologies Used

- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **Hono** - Web framework for HTTP handling
- **@hono/node-server** - Node.js adapter for Hono
- **TypeScript** - Type-safe development

### Extending the Server

To add new tools:

1. Register new tools with `server.registerTool()`
2. Define proper input schemas
3. Implement tool logic with error handling
4. Return results in MCP format

Example:

```typescript
server.registerTool(
  'clock.newTool',
  {
    title: 'New Tool',
    description: 'Description of what the tool does',
    inputSchema: {
      type: 'object',
      properties: {
        // Define parameters
      },
    },
  },
  async args => {
    // Tool implementation
    return {
      content: [
        {
          type: 'text',
          text: 'Tool result',
        },
      ],
    }
  }
)
```

## Environment Variables

- `PORT` - Server port (default: 8788)
- `HOSTNAME` - Server hostname (default: localhost)

## License

This is example code for Hatago development and testing.
