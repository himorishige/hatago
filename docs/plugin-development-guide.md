# Hatago Plugin Development Guide

This guide shows you how to create and publish Hatago plugins using the capability-based architecture.

## Quick Start

### 1. Create a New Plugin

Use the plugin template to bootstrap your plugin:

```bash
# Clone the template (or copy from templates/plugin-template/)
cp -r templates/plugin-template my-plugin
cd my-plugin

# Replace template variables
# Update the following files with your plugin details:
# - package.json: Replace {{SCOPE}}, {{PLUGIN_NAME}}, {{DESCRIPTION}}, {{AUTHOR}}
# - hatago.plugin.json: Update name, description, capabilities
# - src/index.ts: Implement your plugin logic
# - README.md: Update documentation
```

### 2. Configure Your Plugin

Edit `hatago.plugin.json`:

```json
{
  "$schema": "https://hatago.dev/schemas/plugin.json",
  "name": "@my-org/my-plugin",
  "version": "0.1.0",
  "description": "My awesome Hatago plugin",
  "engines": {
    "hatago": "^1.0.0",
    "node": ">=18"
  },
  "capabilities": ["logger", "fetch"],
  "entry": {
    "default": "./dist/index.js"
  }
}
```

### 3. Implement Your Plugin

Edit `src/index.ts`:

```typescript
import type { CapabilityAwarePluginFactory, PluginContext } from '@hatago/core'

const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  return async ({ server, capabilities }) => {
    const { logger, fetch } = capabilities
    
    server.registerTool(
      'my.tool',
      {
        title: 'My Tool',
        description: 'Does something useful',
        inputSchema: {}
      },
      async (args: any) => {
        logger.info('Tool called', { args })
        
        // Your tool implementation here
        return {
          content: [{ type: 'text', text: 'Hello from my plugin!' }]
        }
      }
    )
    
    logger.info('My plugin initialized')
  }
}

export default myPlugin
```

### 4. Build and Test

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Test with a local Hatago app (create test-app.js)
node test-app.js
```

### 5. Publish

```bash
# Build for publication
npm run build

# Publish to npm
npm publish
```

## Capabilities System

Plugins use a capability-based security model where they must declare required capabilities upfront.

### Available Capabilities

| Capability | Description | Node.js | Workers |
|------------|-------------|---------|---------|
| `logger` | Structured logging | ✅ | ✅ |
| `fetch` | HTTP client | ✅ | ✅ |
| `kv` | Key-value storage | ✅ | ✅ |
| `timer` | Timers and intervals | ✅ | ⚠️ Limited |
| `crypto` | Cryptographic functions | ✅ | ✅ |

### Using Capabilities

```typescript
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  return async ({ server, capabilities }) => {
    // Only declared capabilities are available
    const { logger, fetch, kv } = capabilities
    
    // Use capabilities in your tools
    server.registerTool('my.tool', {
      title: 'My Tool',
      description: 'Example tool',
      inputSchema: {}
    }, async (args: any) => {
      // Log activity
      logger.info('Processing request', { args })
      
      // Make HTTP request
      const response = await fetch('https://api.example.com/data')
      const data = await response.json()
      
      // Store in KV
      await kv.set('last-result', JSON.stringify(data))
      
      return { content: [{ type: 'text', text: 'Done!' }] }
    })
  }
}
```

## Plugin Architecture

### Plugin Factory Pattern

Plugins follow the factory pattern:

```typescript
// Plugin factory - called once during plugin load
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  // Setup phase - initialize configuration, validate requirements
  const config = context.config as MyPluginConfig
  
  // Return the actual plugin function
  return async ({ server, capabilities }) => {
    // Registration phase - register tools, resources, etc.
    server.registerTool(/* ... */)
  }
}
```

### Context Object

The `PluginContext` provides:

```typescript
interface PluginContext {
  manifest: PluginManifest  // Plugin metadata
  config: Record<string, unknown>  // User configuration
  runtime: 'node' | 'workers'  // Current runtime
}
```

### Error Handling

```typescript
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  return async ({ server, capabilities }) => {
    const { logger } = capabilities
    
    server.registerTool('my.tool', {
      title: 'My Tool',
      description: 'Tool that might fail',
      inputSchema: {}
    }, async (args: any) => {
      try {
        // Tool implementation
        return { content: [{ type: 'text', text: 'Success!' }] }
      } catch (error) {
        logger.error('Tool failed', { error: error.message, args })
        throw new Error(`Tool failed: ${error.message}`)
      }
    })
  }
}
```

## Multi-Runtime Support

Plugins can run on both Node.js and Cloudflare Workers:

### Runtime Detection

```typescript
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  return async ({ server, capabilities }) => {
    if (context.runtime === 'node') {
      // Node.js specific logic
    } else if (context.runtime === 'workers') {
      // Workers specific logic
    }
  }
}
```

### Runtime-Specific Entry Points

In `hatago.plugin.json`:

```json
{
  "entry": {
    "node": "./dist/node.js",
    "workers": "./dist/workers.js", 
    "default": "./dist/index.js"
  }
}
```

## Testing

### Unit Testing

Create `test/plugin.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import myPlugin from '../src/index.js'

describe('MyPlugin', () => {
  test('should initialize without errors', async () => {
    const context = {
      manifest: {
        name: '@test/my-plugin',
        version: '0.1.0',
        capabilities: ['logger']
      },
      config: {},
      runtime: 'node' as const
    }
    
    const mockServer = {
      registerTool: vi.fn()
    }
    
    const mockCapabilities = {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
    }
    
    const plugin = myPlugin(context)
    await plugin({ 
      server: mockServer as any, 
      capabilities: mockCapabilities as any 
    })
    
    expect(mockServer.registerTool).toHaveBeenCalled()
  })
})
```

### Integration Testing

Test with real Hatago app:

```typescript
// test-integration.ts
import { createApp } from '@hatago/core'
import myPlugin from './src/index.js'

async function test() {
  const { app, server } = await createApp({
    name: 'test-app',
    plugins: [
      myPlugin({ customOption: 'test' })
    ]
  })
  
  // Test tool execution via MCP
  // ...
}

test().catch(console.error)
```

## Best Practices

### 1. Minimal Capabilities

Only declare capabilities you actually use:

```json
{
  "capabilities": ["logger"]  // Don't request fetch if you don't use it
}
```

### 2. Graceful Degradation

Handle missing optional capabilities:

```typescript
const { logger, fetch } = capabilities

if (fetch) {
  // Use HTTP functionality
} else {
  logger.warn('HTTP functionality not available')
}
```

### 3. Configuration Validation

Validate configuration early:

```typescript
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  const config = context.config as MyPluginConfig
  
  if (config.requiredOption === undefined) {
    throw new Error('requiredOption is required')
  }
  
  return async ({ server, capabilities }) => {
    // ...
  }
}
```

### 4. Resource Cleanup

Clean up resources when possible:

```typescript
const myPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  return async ({ server, capabilities }) => {
    const { timer } = capabilities
    
    const intervalId = timer?.setInterval(() => {
      // Periodic task
    }, 60000)
    
    // Return cleanup function (optional)
    return () => {
      if (intervalId && timer) {
        timer.clearInterval(intervalId)
      }
    }
  }
}
```

### 5. Structured Logging

Use structured logging for better observability:

```typescript
logger.info('Operation completed', {
  operation: 'data-sync',
  duration: Date.now() - start,
  recordCount: results.length,
  pluginName: context.manifest.name
})
```

## Publishing

### 1. Prepare for Publication

```bash
# Ensure all files are built
npm run build

# Run linting
npm run lint:fix

# Run type checking
npm run typecheck
```

### 2. Publish to npm

```bash
# Login to npm (first time)
npm login

# Publish
npm publish

# For scoped packages, make public
npm publish --access public
```

### 3. Version Management

Use semantic versioning:

```bash
# Patch release (bug fixes)
npm version patch

# Minor release (new features)
npm version minor

# Major release (breaking changes)
npm version major
```

## Plugin Examples

See the official plugins for reference:

- [@hatago/plugin-logger](../packages/plugin-logger/) - Structured logging
- [@hatago/plugin-kv](../packages/plugin-kv/) - Key-value storage
- [@hatago/plugin-rate-limit](../packages/plugin-rate-limit/) - Rate limiting

## Resources

- [Plugin Specification](./plugin-specification.md)
- [Capability Reference](./capabilities.md)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Hatago Core API](../packages/core/README.md)