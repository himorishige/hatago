# Hatago Plugin Specification

Technical specification for Hatago plugins using functional programming architecture.

## Overview

Hatago plugins are **pure functions** that extend the framework. This specification defines the plugin interface, lifecycle, and requirements.

## Plugin Interface

### Core Type Definition

```typescript
type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>
```

### Context Interface

```typescript
interface HatagoContext {
  app: Hono // Hono web framework instance
  server: McpServer // MCP server instance
  env?: Record<string, unknown> // Environment variables
  getBaseUrl?: (req: Request) => URL // Base URL helper function
}
```

## Plugin Patterns

### Simple Plugin

Direct function export:

```typescript
export const simplePlugin: HatagoPlugin = ctx => {
  // Plugin implementation
}
```

### Factory Pattern

Factory function for configurable plugins:

```typescript
export function createPlugin(config?: PluginConfig): HatagoPlugin {
  return ctx => {
    // Use config in plugin implementation
  }
}
```

### Composed Plugin

Multiple plugins combined:

```typescript
export function createComposedPlugin(): HatagoPlugin {
  return combinePlugins(pluginA, pluginB, pluginC)
}
```

## Plugin Lifecycle

### 1. Loading Phase

```typescript
// Plugin is imported
import { myPlugin } from '@hatago/plugin-example'

// Or created via factory
const plugin = createPlugin(config)
```

### 2. Application Phase

```typescript
// Plugin function is called with context
await plugin({
  app,
  server,
  env: process.env,
  getBaseUrl,
})
```

### 3. Runtime Phase

Plugin's registered tools, resources, and routes are available for use.

## Plugin Capabilities

### MCP Tool Registration

```typescript
server.registerTool(
  name: string,
  schema: {
    description: string
    inputSchema: JSONSchema
  },
  handler: (args: any, meta?: { progressToken?: string }) => Promise<ToolResult>
)
```

### MCP Resource Registration

```typescript
server.registerResource(
  uri: string,
  metadata: {
    name: string
    description?: string
    mimeType?: string
  },
  handler: () => Promise<ResourceContent>
)
```

### HTTP Route Registration

```typescript
app.get(path: string, handler: Handler)
app.post(path: string, handler: Handler)
app.put(path: string, handler: Handler)
app.delete(path: string, handler: Handler)
```

### Middleware Registration

```typescript
app.use(middleware: MiddlewareHandler)
app.use(path: string, middleware: MiddlewareHandler)
```

## Functional Programming Requirements

### 1. No Classes

```typescript
// ❌ Incorrect - Class-based
export class MyPlugin {
  constructor(config: Config) {}
  apply(ctx: HatagoContext) {}
}

// ✅ Correct - Function-based
export function createMyPlugin(config: Config): HatagoPlugin {
  return ctx => {}
}
```

### 2. Pure Functions

Business logic must be pure:

```typescript
// ✅ Pure function
function calculate(a: number, b: number): number {
  return a + b
}

// ❌ Impure function
let total = 0
function addToTotal(value: number): void {
  total += value // Side effect
}
```

### 3. Immutable Data

Never mutate data structures:

```typescript
// ✅ Immutable update
const newState = { ...state, count: state.count + 1 }

// ❌ Mutation
state.count++
```

### 4. Composition Over Inheritance

```typescript
// ✅ Composition
const enhancedPlugin = compose(withLogging, withRetry, withCache)(basePlugin)

// ❌ Inheritance
class EnhancedPlugin extends BasePlugin {}
```

## Plugin Configuration

### Configuration Schema

```typescript
interface PluginConfig {
  enabled?: boolean
  [key: string]: unknown
}
```

### Environment Variables

Plugins should read configuration from environment:

```typescript
export const plugin: HatagoPlugin = ctx => {
  const apiKey = ctx.env?.API_KEY
  if (!apiKey) {
    throw new Error('API_KEY required')
  }
}
```

### Validation

Use schema validation for configuration:

```typescript
import { z } from 'zod'

const configSchema = z.object({
  apiKey: z.string().min(1),
  timeout: z.number().positive().default(5000),
})

export function createPlugin(config: unknown): HatagoPlugin {
  const validConfig = configSchema.parse(config)
  return ctx => {
    // Use validConfig
  }
}
```

## Error Handling

### Error Types

```typescript
// Tool errors
interface ToolError {
  content: Array<{ type: 'text'; text: string }>
  isError: true
}

// Plugin initialization errors
class PluginError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message)
  }
}
```

### Error Handling Pattern

```typescript
export const plugin: HatagoPlugin = ctx => {
  ctx.server.registerTool('my_tool', schema, async args => {
    try {
      const result = await process(args)
      return { content: [{ type: 'text', text: result }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      }
    }
  })
}
```

## Testing Requirements

### Unit Testing

Test pure functions in isolation:

```typescript
describe('Plugin Functions', () => {
  it('should process data correctly', () => {
    const result = processData('input')
    expect(result).toBe('expected')
  })
})
```

### Integration Testing

Test plugin with mock context:

```typescript
describe('Plugin', () => {
  it('should register tools', () => {
    const mockServer = { registerTool: vi.fn() }
    const mockApp = {}

    plugin({ server: mockServer, app: mockApp })

    expect(mockServer.registerTool).toHaveBeenCalled()
  })
})
```

## Package Structure

### Required Files

```
my-plugin/
├── package.json       # Package metadata
├── src/
│   └── index.ts      # Main export
├── dist/             # Compiled output
│   ├── index.js
│   └── index.d.ts
└── README.md         # Documentation
```

### Package.json Requirements

```json
{
  "name": "@scope/hatago-plugin-name",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@hatago/core": "^0.2.0"
  }
}
```

### Export Requirements

```typescript
// Named export for simple plugin
export const myPlugin: HatagoPlugin = ctx => {}

// Factory function for configurable plugin
export function createMyPlugin(config?: Config): HatagoPlugin {}

// Type exports
export type { Config, MyPluginOptions }

// Default export (optional)
export default myPlugin
```

## Security Requirements

### Input Validation

All inputs must be validated:

```typescript
ctx.server.registerTool('secure_tool', { inputSchema: schema }, async args => {
  const validated = validateInput(args)
  // Process validated input
})
```

### Secret Management

Never hardcode secrets:

```typescript
// ❌ Bad
const apiKey = 'sk-1234567890'

// ✅ Good
const apiKey = ctx.env?.API_KEY
```

### Output Sanitization

Sanitize outputs to prevent injection:

```typescript
function sanitizeOutput(text: string): string {
  return text.replace(/<script>/gi, '')
}
```

## Performance Guidelines

### Lazy Loading

Load resources on demand:

```typescript
export function createPlugin(): HatagoPlugin {
  let heavyResource: HeavyResource | null = null

  return ctx => {
    ctx.server.registerTool('lazy_tool', schema, async args => {
      if (!heavyResource) {
        heavyResource = await import('./heavy-resource')
      }
      return heavyResource.process(args)
    })
  }
}
```

### Memoization

Cache expensive computations:

```typescript
const memoizedCalculation = memoize(expensiveCalculation)

export const plugin: HatagoPlugin = ctx => {
  ctx.server.registerTool('cached_tool', schema, async args => {
    const result = memoizedCalculation(args)
    return { content: [{ type: 'text', text: result }] }
  })
}
```

## Compatibility

### Runtime Support

Plugins must work on:

- Node.js 18+
- Cloudflare Workers
- Deno (optional)
- Bun (optional)

### TypeScript

- Target: ES2022
- Module: ESNext
- Strict mode enabled

## Best Practices

### 1. Single Responsibility

Each plugin should have one clear purpose.

### 2. Documentation

Include comprehensive README with:

- Installation instructions
- Configuration options
- Usage examples
- API reference

### 3. Versioning

Follow semantic versioning:

- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

### 4. Dependencies

- Minimize dependencies
- Use peerDependencies for @hatago/core
- Avoid heavy libraries

### 5. Testing

- Minimum 80% code coverage
- Test all error conditions
- Test with different configurations

## Compliance Checklist

- [ ] Pure function architecture
- [ ] No classes used
- [ ] Immutable data structures
- [ ] Input validation
- [ ] Error handling
- [ ] TypeScript types exported
- [ ] Documentation complete
- [ ] Tests included
- [ ] Security reviewed
- [ ] Performance optimized
