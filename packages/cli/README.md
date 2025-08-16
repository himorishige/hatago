# @hatago/cli

Command line interface for Hatago MCP framework.

## Overview

The Hatago CLI provides tools for scaffolding, developing, and managing Hatago MCP servers. It includes project templates, development servers, plugin generators, and configuration management utilities.

## Installation

```bash
# Global installation
npm install -g @hatago/cli

# Or use without installing
npx @hatago/cli --help
```

## Commands

### `hatago init`

Initialize a new Hatago project.

```bash
# Create new project
hatago init my-mcp-server

# With specific template
hatago init my-server --template node-http
hatago init my-server --template workers
hatago init my-server --template stdio-only
```

### `hatago dev`

Start development server with hot reload.

```bash
# Start development server
hatago dev

# With specific port
hatago dev --port 3000

# stdio mode
hatago dev --stdio

# With environment file
hatago dev --env .env.development
```

### `hatago create-plugin`

Generate a new plugin.

```bash
# Create basic plugin
hatago create-plugin my-plugin

# Create plugin with template
hatago create-plugin my-plugin --template mcp-wrapper
hatago create-plugin my-plugin --template basic

# With OAuth integration
hatago create-plugin my-plugin --template oauth
```

### `hatago config`

Manage configuration files.

```bash
# Show current configuration
hatago config show

# Validate configuration
hatago config validate

# Generate default config
hatago config init

# Add MCP server to config
hatago add-server my-server --command "node server.js"
```

### `hatago scaffold`

Generate boilerplate code.

```bash
# Scaffold HTTP routes
hatago scaffold routes

# Scaffold MCP tools
hatago scaffold tools

# Scaffold tests
hatago scaffold tests
```

## Project Templates

### Node.js HTTP Server

```bash
hatago init my-server --template node-http
```

Creates:

```
my-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts
│   ├── stdio.ts
│   └── plugins/
│       └── example.ts
├── tests/
│   └── server.test.ts
└── hatago.config.json
```

### Cloudflare Workers

```bash
hatago init my-worker --template workers
```

Creates:

```
my-worker/
├── package.json
├── wrangler.toml
├── src/
│   ├── worker.ts
│   └── plugins/
│       └── kv-plugin.ts
└── tests/
    └── worker.test.ts
```

### stdio Only

```bash
hatago init my-stdio-server --template stdio-only
```

Creates:

```
my-stdio-server/
├── package.json
├── src/
│   ├── main.ts
│   └── tools/
│       └── example-tool.ts
└── claude_desktop_config.json
```

## Plugin Templates

### Basic Plugin

```bash
hatago create-plugin my-plugin --template basic
```

Generates:

```typescript
import type { HatagoPlugin } from '@hatago/core'

export const myPlugin = (): HatagoPlugin => {
  return ctx => {
    ctx.server.registerTool(
      'my_tool',
      {
        title: 'My Tool',
        description: 'Example tool',
      },
      async args => {
        return {
          content: [
            {
              type: 'text',
              text: 'Hello from my plugin!',
            },
          ],
        }
      }
    )
  }
}
```

### MCP Wrapper Plugin

```bash
hatago create-plugin github-integration --template mcp-wrapper
```

Generates OAuth-enabled plugin with:

- Authentication flow
- API client setup
- Error handling
- Configuration management

### OAuth Plugin

```bash
hatago create-plugin oauth-plugin --template oauth
```

Generates:

- OAuth 2.1 flow implementation
- Token management
- Secure credential storage
- Provider templates (GitHub, Google, Slack)

## Configuration

### Global Configuration

```bash
# Location: ~/.hatago/config.json
{
  "defaultTemplate": "node-http",
  "registry": "https://npm.registry.com",
  "defaultPort": 8787,
  "editor": "code"
}
```

### Project Configuration

```bash
# hatago.config.json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "runtime": "node",
  "transport": ["http", "stdio"],
  "plugins": [
    "./src/plugins/custom-plugin"
  ],
  "env": {
    "development": {
      "LOG_LEVEL": "debug"
    },
    "production": {
      "LOG_LEVEL": "info",
      "REQUIRE_AUTH": "true"
    }
  }
}
```

## Development Workflow

### 1. Initialize Project

```bash
hatago init my-project --template node-http
cd my-project
```

### 2. Develop with Hot Reload

```bash
# Start development server
hatago dev

# In another terminal, test the server
curl http://localhost:8787/health
```

### 3. Add Custom Plugin

```bash
# Generate plugin
hatago create-plugin weather --template basic

# Edit the generated plugin
# Add to hatago.config.json plugins array
```

### 4. Test stdio Mode

```bash
# Start stdio server
hatago dev --stdio

# Test with echo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | hatago dev --stdio
```

### 5. Deploy

```bash
# Build project
npm run build

# For Node.js
npm start

# For Workers
npm run deploy
```

## Advanced Usage

### Custom Templates

Create custom templates in `~/.hatago/templates/`:

```
~/.hatago/templates/my-template/
├── template.config.json
├── package.json.hbs
├── src/
│   └── {{name}}.ts.hbs
└── README.md.hbs
```

Template configuration:

```json
{
  "name": "my-template",
  "description": "My custom template",
  "prompts": [
    {
      "name": "includeAuth",
      "type": "confirm",
      "message": "Include authentication?"
    }
  ]
}
```

### Environment Management

```bash
# Multiple environment files
hatago dev --env .env.development
hatago dev --env .env.staging

# Environment-specific configuration
hatago config show --env production
```

### Plugin Development

```bash
# Watch plugin for changes
hatago dev --watch-plugins

# Test plugin in isolation
hatago test-plugin ./src/plugins/my-plugin.ts

# Validate plugin
hatago validate-plugin ./src/plugins/my-plugin.ts
```

## Integrations

### VS Code

Install the Hatago VS Code extension for:

- Syntax highlighting for hatago.config.json
- Plugin templates and snippets
- Integrated development server
- Debug configuration

### Claude Desktop

Generate Claude Desktop configuration:

```bash
# Generate config for current project
hatago config claude-desktop

# Output:
{
  "mcpServers": {
    "my-project": {
      "command": "node",
      "args": ["dist/stdio.js"],
      "cwd": "/path/to/my-project"
    }
  }
}
```

### Docker

Generate Dockerfile:

```bash
hatago scaffold docker

# Creates optimized Dockerfile
# Multi-stage build
# Production-ready configuration
```

## Troubleshooting

### Common Issues

**Command not found**

```bash
# Check installation
npm list -g @hatago/cli

# Reinstall if needed
npm uninstall -g @hatago/cli
npm install -g @hatago/cli
```

**Port already in use**

```bash
# Use different port
hatago dev --port 3001

# Find process using port
lsof -i :8787
```

**Plugin not loading**

```bash
# Validate plugin syntax
hatago validate-plugin ./src/plugins/my-plugin.ts

# Check configuration
hatago config validate

# Enable debug logging
DEBUG=hatago:* hatago dev
```

### Debug Mode

```bash
# Enable CLI debug output
DEBUG=hatago:cli hatago dev

# Enable full debug
DEBUG=* hatago dev

# Log level
LOG_LEVEL=debug hatago dev
```

## API Reference

### CLI Options

```bash
# Global options
--version, -v          Show version
--help, -h            Show help
--config <path>       Use custom config file
--verbose             Verbose output
--quiet               Suppress output

# Development options
--port <number>       Server port (default: 8787)
--host <string>       Server host (default: localhost)
--stdio              Use stdio transport
--env <path>         Environment file path
--watch              Watch for file changes
```

### Configuration Schema

```typescript
interface HatagoConfig {
  name: string
  version: string
  runtime: 'node' | 'workers' | 'deno' | 'bun'
  transport: ('http' | 'stdio')[]
  plugins: string[]
  env: Record<string, Record<string, string>>
}
```

## Examples

### Complete Node.js Project

```bash
# Initialize
hatago init weather-server --template node-http

# Add weather plugin
cd weather-server
hatago create-plugin weather-api --template mcp-wrapper

# Configure for development
hatago config show
hatago dev --port 3000
```

### Workers Deployment

```bash
# Initialize Workers project
hatago init edge-mcp --template workers

# Add KV plugin
cd edge-mcp
hatago create-plugin kv-storage --template basic

# Deploy
npm run deploy
```

### Plugin Package

```bash
# Create standalone plugin package
hatago create-plugin @myorg/hatago-plugin-slack --template oauth

# Publish to npm
cd @myorg/hatago-plugin-slack
npm publish
```

## Contributing

### Plugin Templates

Submit new plugin templates to the [templates repository](https://github.com/himorishige/hatago-templates).

### Feature Requests

Request new CLI features through [GitHub Issues](https://github.com/himorishige/hatago/issues).

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/config](../config) - Configuration management
- [@hatago/adapter-node](../adapter-node) - Node.js adapter
- [@hatago/adapter-workers](../adapter-workers) - Workers adapter
