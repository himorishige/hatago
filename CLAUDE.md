# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago is a lightweight, fast, and simple remote MCP (Model Context Protocol) server built with **Hono + @hono/mcp + MCP TypeScript SDK**. It features a plugin-based architecture for extensibility.

- **Core Philosophy**: Keep the core minimal and extend functionality through plugins
- **Environment Agnostic**: Runs on Node.js, Cloudflare Workers, Deno, and Bun
- **Plugin System**: OAuth PRM publishing and streaming "Hello Hatago" test tool included

## Development Commands

```bash
# Install dependencies
pnpm i

# Start development server (Node.js)
pnpm dev
# → Access http://localhost:8787/health to verify

# Start development server (Cloudflare Workers)
pnpm dev:cf

# Build the project
pnpm build

# Type checking
pnpm typecheck

# Start production server
pnpm start
```

## Architecture Overview

### Core Components

- **`src/app.ts`**: Main application entry point that creates Hono app and MCP server
- **`src/system/`**: Core system components
  - `plugins.ts`: Plugin loader that applies plugins to the context
  - `types.ts`: Core type definitions including `HatagoContext` and `HatagoPlugin`
- **`src/plugins/`**: Plugin implementations
  - `index.ts`: Default plugin configuration
  - `hello-hatago.ts`: Demo plugin that streams "Hello Hatago" with progress notifications
  - `oauth-metadata.ts`: OAuth Protected Resource Metadata (RFC 9728) support

### Plugin System

Plugins follow the `HatagoPlugin` type pattern:
```typescript
export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

export type HatagoContext = {
  app: Hono              // Hono app instance for HTTP routes
  server: McpServer      // MCP server instance for tools/resources
  env?: Record<string, unknown>  // Environment variables
  getBaseUrl: (req: Request) => URL  // Base URL helper
}
```

To add new plugins:
1. Create plugin in `src/plugins/`
2. Register in `src/plugins/index.ts`
3. Use `server.registerTool()` for MCP tools or `app.get()`/`app.post()` for HTTP endpoints

### MCP Endpoints

- **`POST /mcp`**: Main MCP endpoint using Streamable HTTP transport
- **`GET /.well-known/oauth-protected-resource`**: OAuth Protected Resource Metadata
- **`GET /health`**: Health check endpoint
- **`GET /`**: Simple landing page

### Key Features

- **Streamable HTTP**: Uses MCP's latest transport specification
- **Progress Notifications**: Supports `_meta.progressToken` for streaming updates
- **OAuth Integration**: Built-in OAuth PRM support with Bearer token validation
- **Multi-Runtime**: Works across Node.js, Cloudflare Workers, Deno, and Bun

## Testing MCP Functionality

Use curl to test MCP endpoints:

1. Initialize:
```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}
}'
```

2. List tools:
```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":2,"method":"tools/list"
}'
```

3. Call tool with progress:
```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"hello.hatago","arguments":{},"_meta":{"progressToken":"hello-1"}}
}'
```

## Environment Variables

- `AUTH_ISSUER`: Authorization Server issuer URL (e.g., `https://auth.example.com`)
- `RESOURCE`: Resource identifier URL (defaults to request origin)
- `REQUIRE_AUTH`: Set to `"true"` to enforce Bearer token authentication on `/mcp`

## Project Structure

```
server/
├── src/
│   ├── app.ts              # Main application factory
│   ├── dev-node.ts         # Node.js development server
│   ├── worker.ts           # Cloudflare Workers entry point
│   ├── middleware/
│   │   └── mcp.ts          # Custom MCP middleware
│   ├── plugins/
│   │   ├── index.ts        # Plugin registry
│   │   ├── hello-hatago.ts # Demo streaming tool
│   │   └── oauth-metadata.ts # OAuth PRM support
│   └── system/
│       ├── plugins.ts      # Plugin application logic
│       └── types.ts        # Core type definitions
├── package.json
├── tsconfig.json
└── wrangler.jsonc         # Cloudflare Workers config
```

## Development Notes

- The core is intentionally minimal - all functionality is added through plugins
- When adding new tools, consider progress notification support for better UX
- OAuth authentication is optional but follows RFC 9728 standards when enabled
- The project supports both single-file and streaming responses based on client capabilities