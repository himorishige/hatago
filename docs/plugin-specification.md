# Hatago Plugin Specification

## Overview

Hatago plugins follow a capability-based security model where plugins must declare required capabilities and the host enforces deny-by-default access control.

## Plugin Manifest (hatago.plugin.json)

Every plugin must include a `hatago.plugin.json` manifest file:

```json
{
  "$schema": "https://hatago.dev/schemas/plugin.json",
  "name": "@example/my-plugin",
  "version": "1.0.0",
  "description": "Example Hatago plugin",
  "engines": {
    "hatago": "^1.0.0",
    "node": ">=18",
    "workers": ">=2023-10-30"
  },
  "capabilities": [
    "fetch",
    "kv", 
    "logger"
  ],
  "entry": {
    "node": "./dist/index.js",
    "workers": "./dist/worker.js",
    "default": "./dist/index.js"
  },
  "mcp": {
    "tools": [
      {
        "name": "my.tool",
        "title": "My Tool",
        "description": "Example tool"
      }
    ]
  }
}
```

### Manifest Fields

- **name**: Plugin package name (follows npm naming conventions)
- **version**: Semantic version
- **description**: Human-readable description
- **engines**: Runtime requirements
  - `hatago`: Compatible Hatago core version
  - `node`: Node.js version requirement (optional)
  - `workers`: Cloudflare Workers compatibility date (optional)
- **capabilities**: Array of required capabilities
- **entry**: Runtime-specific entry points
- **mcp**: MCP tool declarations (optional)

## Capabilities

### Core Capabilities

- **fetch**: HTTP client access
- **kv**: Key-value storage
- **logger**: Structured logging
- **timer**: Timers and intervals
- **crypto**: Cryptographic functions

### Capability Enforcement

- Plugins can only access capabilities they declare
- Undeclared capability access throws `CapabilityError`
- Host validates capability compatibility at load time

## Plugin API

### Plugin Entry Point

```typescript
import type { HatagoPlugin, PluginContext } from '@hatago/core'

export default function plugin(context: PluginContext): HatagoPlugin {
  return async ({ server, capabilities }) => {
    // Plugin implementation
    const { logger, fetch } = capabilities
    
    server.registerTool('my.tool', {
      title: 'My Tool',
      description: 'Example tool',
      inputSchema: {}
    }, async (args) => {
      logger.info('Tool called', { args })
      return { content: [{ type: 'text', text: 'Hello' }] }
    })
  }
}
```

### Context Interface

```typescript
interface PluginContext {
  manifest: PluginManifest
  config: Record<string, unknown>
  runtime: 'node' | 'workers'
}
```

### Capability Interfaces

```typescript
interface Logger {
  debug(message: string, meta?: object): void
  info(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  error(message: string, meta?: object): void
}

interface KV {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
}

interface Fetch {
  (input: RequestInfo, init?: RequestInit): Promise<Response>
}
```

## Plugin Lifecycle

1. **Load**: Plugin manifest is validated
2. **Initialize**: Plugin function is called with context
3. **Register**: Plugin registers tools/resources with MCP server
4. **Runtime**: Plugin tools are available for execution
5. **Dispose**: Plugin cleanup (optional)

## Security Model

- **Sandboxing**: Plugins run in isolated contexts
- **Capability-based**: Only declared capabilities are accessible
- **Validation**: All plugin inputs/outputs are validated
- **Auditing**: All capability usage is logged

## Best Practices

1. **Minimal Capabilities**: Only declare capabilities you actually use
2. **Error Handling**: Properly handle capability errors
3. **Async Safety**: Use proper async/await patterns
4. **Resource Cleanup**: Implement dispose hooks if needed
5. **Type Safety**: Use TypeScript for better development experience

## Plugin Development

### Setup

```bash
npm init hatago-plugin my-plugin
cd my-plugin
npm install
```

### Development Commands

```bash
npm run dev      # Development server
npm run build    # Build for all runtimes
npm run test     # Run tests
npm run lint     # Lint code
```

### Testing

Plugins should include tests for both Node.js and Workers runtimes:

```typescript
import { test } from 'uvu'
import { createMockContext } from '@hatago/test-utils'

test('plugin works', async () => {
  const context = createMockContext({
    capabilities: ['logger', 'fetch']
  })
  
  const plugin = await import('./src/index.js')
  // Test plugin behavior
})
```

## Publishing

1. Build for all target runtimes
2. Run tests on all runtimes  
3. Validate manifest schema
4. Publish to npm registry

```bash
npm run build
npm test
npm publish
```