# Getting Started with Hatago

This guide will help you get up and running with Hatago in just a few minutes.

## Prerequisites

- **Node.js 18+** or **Bun** or **Deno**
- **pnpm** (recommended) or npm
- Basic knowledge of TypeScript and MCP (Model Context Protocol)

## Installation

### Using the CLI (Recommended)

```bash
# Install Hatago CLI globally
npm install -g @hatago/cli

# Create a new project
hatago init my-mcp-server
cd my-mcp-server

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Manual Setup

```bash
# Create a new directory
mkdir my-mcp-server
cd my-mcp-server

# Initialize package.json
pnpm init

# Install Hatago packages
pnpm add @hatago/core @hatago/adapter-node @hatago/hono-mcp

# Install dev dependencies
pnpm add -D typescript tsx @types/node
```

## Your First Hatago Server

Create a simple MCP server with a custom tool:

### 1. Create the Server

Create `src/server.ts`:

```typescript
import { createApp } from '@hatago/core'
import { createNodeAdapter } from '@hatago/adapter-node'
import type { HatagoPlugin } from '@hatago/core'

// Create a simple plugin
const helloPlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'hello',
    {
      description: 'Say hello to someone',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
    },
    async args => {
      return {
        content: [
          {
            type: 'text',
            text: `Hello, ${args.name}! Welcome to Hatago!`,
          },
        ],
      }
    }
  )
}

// Create and configure the app
async function main() {
  const { app, server } = await createApp({
    name: 'my-mcp-server',
    version: '1.0.0',
  })

  // Apply plugins
  await helloPlugin({ app, server, env: process.env })

  // Create Node.js adapter
  const adapter = createNodeAdapter({
    app,
    port: 8787,
    hostname: 'localhost',
  })

  // Start the server
  await adapter.start()
  console.log('🚀 Server running at http://localhost:8787')
}

main().catch(console.error)
```

### 2. Create TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Add Scripts

Update `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

### 4. Run the Server

```bash
# Start in development mode
pnpm dev

# The server is now running at http://localhost:8787
```

## Testing Your Server

### Test with curl

```bash
# Initialize the MCP session
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'

# List available tools
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'

# Call the hello tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "hello",
      "arguments": {
        "name": "World"
      }
    }
  }'
```

## Using stdio Mode

Hatago also supports stdio transport for direct integration with Claude Desktop:

### 1. Create stdio Server

Create `src/stdio.ts`:

```typescript
import { createApp } from '@hatago/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { HatagoPlugin } from '@hatago/core'

// Your plugin (same as before)
const helloPlugin: HatagoPlugin = ctx => {
  // ... same plugin code
}

async function main() {
  const { server } = await createApp({
    name: 'my-mcp-server',
    version: '1.0.0',
  })

  // Apply plugins
  await helloPlugin({ server })

  // Use stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
```

### 2. Configure for Claude Desktop

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["dist/stdio.js"],
      "cwd": "/path/to/my-mcp-server"
    }
  }
}
```

## Adding Plugins

### Using Official Plugins

```bash
# Install official plugins
pnpm add @hatago/plugin-hello-hatago @hatago/plugin-logger

# Use in your server
```

```typescript
import { helloHatago } from '@hatago/plugin-hello-hatago'
import { createLoggerPlugin } from '@hatago/plugin-logger'

const { app, server } = await createApp({
  name: 'my-server',
  version: '1.0.0',
})

// Apply plugins
await helloHatago()({ app, server, env: process.env })
await createLoggerPlugin()({ app, server, env: process.env })
```

### Creating Custom Plugins

```typescript
import type { HatagoPlugin } from '@hatago/core'

export const myCustomPlugin: HatagoPlugin = ctx => {
  const { app, server, env } = ctx

  // Register MCP tools
  server.registerTool(
    'my_tool',
    {
      description: 'My custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
    },
    async args => {
      // Tool implementation
      return {
        content: [
          {
            type: 'text',
            text: `Processed: ${args.input}`,
          },
        ],
      }
    }
  )

  // Add HTTP routes (optional)
  app.get('/my-endpoint', c => {
    return c.json({ message: 'Hello from plugin' })
  })
}
```

## Configuration

### Environment Variables

```bash
# .env file
LOG_LEVEL=debug
PORT=8787
HOSTNAME=localhost
```

### Hatago Config File

Create `hatago.config.json`:

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "plugins": ["@hatago/plugin-hello-hatago", "./src/plugins/custom-plugin.ts"],
  "server": {
    "port": 8787,
    "hostname": "localhost"
  }
}
```

## Deployment

### Node.js Production

```bash
# Build the project
pnpm build

# Start production server
NODE_ENV=production node dist/server.js
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE 8787
CMD ["node", "dist/server.js"]
```

### Cloudflare Workers

```typescript
// src/worker.ts
import { createApp } from '@hatago/core'
import { createWorkersAdapter } from '@hatago/adapter-workers'

export default createWorkersAdapter(
  await createApp({
    name: 'my-worker',
    version: '1.0.0',
  })
)
```

## Next Steps

- [Learn about Hatago's architecture](./architecture.md)
- [Develop your own plugins](./guides/plugin-development.md)
- [Integrate external MCP servers](./guides/external-mcp-servers.md)
- [Explore the API reference](./api-reference.md)

## Getting Help

- Check the [CLI Reference](./cli/README.md) for command options
- Browse [example projects](https://github.com/himorishige/hatago/tree/main/apps)
- Ask questions in [GitHub Discussions](https://github.com/himorishige/hatago/discussions)
