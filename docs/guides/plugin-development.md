# Hatago Plugin Development Guide

Learn how to create plugins for Hatago using functional programming patterns.

## Overview

Hatago plugins are **pure functions** that extend the framework's capabilities. They follow functional programming principles:

- **No classes** - Use factory functions instead
- **Immutable data** - Never mutate state
- **Pure functions** - No side effects in business logic
- **Composition** - Build complex features from simple functions

## Quick Start

### Create Your First Plugin

```typescript
import type { HatagoPlugin } from '@hatago/core'

// Plugin is a pure function
export const myPlugin: HatagoPlugin = ctx => {
  const { app, server, env } = ctx

  // Register an MCP tool
  server.registerTool(
    'my_tool',
    {
      description: 'My custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
    },
    async args => {
      return {
        content: [
          {
            type: 'text',
            text: `You said: ${args.message}`,
          },
        ],
      }
    }
  )
}
```

### Use the Plugin

```typescript
import { createApp } from '@hatago/core'
import { myPlugin } from './my-plugin'

const { app, server } = await createApp({
  name: 'my-server',
  version: '1.0.0',
})

// Apply the plugin
await myPlugin({ app, server, env: process.env })
```

## Plugin Architecture

### The Plugin Function

Every plugin is a function that receives a context:

```typescript
type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

interface HatagoContext {
  app: Hono // HTTP framework instance
  server: McpServer // MCP server instance
  env?: Record<string, unknown> // Environment variables
  getBaseUrl?: (req: Request) => URL // URL helper
}
```

### Factory Pattern for Configuration

Use factory functions to create configurable plugins:

```typescript
// Factory function creates the plugin
export function createMyPlugin(config?: MyPluginConfig): HatagoPlugin {
  // Default configuration
  const finalConfig = {
    enabled: true,
    timeout: 5000,
    ...config,
  }

  // Return the actual plugin function
  return ctx => {
    if (!finalConfig.enabled) return

    ctx.server.registerTool(
      'configured_tool',
      {
        /* schema */
      },
      async args => {
        // Use configuration
        const result = await processWithTimeout(args, finalConfig.timeout)
        return { content: [{ type: 'text', text: result }] }
      }
    )
  }
}

// Usage
const plugin = createMyPlugin({ timeout: 10000 })
await plugin(context)
```

## Functional Patterns

### Pure Functions for Business Logic

Separate pure functions from side effects:

```typescript
// Pure function - no side effects
function calculateResult(input: string): string {
  return input.toUpperCase().split('').reverse().join('')
}

// Pure validation
function validateInput(input: unknown): input is string {
  return typeof input === 'string' && input.length > 0
}

// Plugin uses pure functions
export const purePlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'pure_tool',
    {
      /* schema */
    },
    async args => {
      // Validate with pure function
      if (!validateInput(args.input)) {
        throw new Error('Invalid input')
      }

      // Calculate with pure function
      const result = calculateResult(args.input)

      return {
        content: [{ type: 'text', text: result }],
      }
    }
  )
}
```

### Composition

Build complex plugins from simple functions:

```typescript
// Small, focused functions
const withLogging = (fn: Function) => {
  return async (...args: any[]) => {
    console.log('Calling function:', fn.name)
    const result = await fn(...args)
    console.log('Function completed')
    return result
  }
}

const withRetry = (fn: Function, retries = 3) => {
  return async (...args: any[]) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args)
      } catch (error) {
        if (i === retries - 1) throw error
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
}

// Compose functions
const processData = withLogging(
  withRetry(async (data: string) => {
    // Process data
    return data.toUpperCase()
  })
)

// Use in plugin
export const composedPlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'composed_tool',
    {
      /* schema */
    },
    async args => {
      const result = await processData(args.input)
      return { content: [{ type: 'text', text: result }] }
    }
  )
}
```

### Immutable State Management

Never mutate data:

```typescript
// State type
interface PluginState {
  readonly count: number
  readonly items: readonly string[]
}

// State updates return new objects
function addItem(state: PluginState, item: string): PluginState {
  return {
    ...state,
    count: state.count + 1,
    items: [...state.items, item],
  }
}

// Plugin with immutable state
export function createStatefulPlugin(): HatagoPlugin {
  return ctx => {
    let state: PluginState = { count: 0, items: [] }

    ctx.server.registerTool(
      'add_item',
      {
        /* schema */
      },
      async args => {
        // Update state immutably
        state = addItem(state, args.item)

        return {
          content: [
            {
              type: 'text',
              text: `Added item. Total: ${state.count}`,
            },
          ],
        }
      }
    )
  }
}
```

## Advanced Patterns

### Higher-Order Plugins

Create plugins that enhance other plugins:

```typescript
// Higher-order plugin adds logging
function withPluginLogging(plugin: HatagoPlugin): HatagoPlugin {
  return ctx => {
    console.log(`Applying plugin...`)
    const result = plugin(ctx)
    console.log(`Plugin applied`)
    return result
  }
}

// Usage
const enhancedPlugin = withPluginLogging(myPlugin)
```

### Plugin Composition

Combine multiple plugins:

```typescript
function combinePlugins(...plugins: HatagoPlugin[]): HatagoPlugin {
  return async ctx => {
    for (const plugin of plugins) {
      await plugin(ctx)
    }
  }
}

// Usage
const megaPlugin = combinePlugins(plugin1, plugin2, plugin3)
```

### Dependency Injection

Use closures for dependency injection:

```typescript
// Dependencies as parameters
export function createDatabasePlugin(database: Database, cache: Cache): HatagoPlugin {
  return ctx => {
    ctx.server.registerTool(
      'query_data',
      {
        /* schema */
      },
      async args => {
        // Check cache first
        const cached = await cache.get(args.query)
        if (cached) {
          return { content: [{ type: 'text', text: cached }] }
        }

        // Query database
        const result = await database.query(args.query)
        await cache.set(args.query, result)

        return { content: [{ type: 'text', text: result }] }
      }
    )
  }
}
```

## Testing Plugins

### Unit Testing

Test pure functions separately:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateResult, validateInput } from './my-plugin'

describe('Plugin Functions', () => {
  describe('calculateResult', () => {
    it('should transform input correctly', () => {
      expect(calculateResult('hello')).toBe('OLLEH')
    })
  })

  describe('validateInput', () => {
    it('should validate strings', () => {
      expect(validateInput('test')).toBe(true)
      expect(validateInput('')).toBe(false)
      expect(validateInput(123)).toBe(false)
    })
  })
})
```

### Integration Testing

Test the plugin with mock context:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { myPlugin } from './my-plugin'

describe('MyPlugin', () => {
  it('should register tools', async () => {
    const mockServer = {
      registerTool: vi.fn(),
    }
    const mockApp = {}

    await myPlugin({
      server: mockServer as any,
      app: mockApp as any,
      env: {},
    })

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'my_tool',
      expect.any(Object),
      expect.any(Function)
    )
  })
})
```

## Best Practices

### 1. Keep It Pure

```typescript
// ✅ Good - Pure function
function processData(input: string): string {
  return input.trim().toLowerCase()
}

// ❌ Bad - Side effects
let cache = {}
function processDataBad(input: string): string {
  cache[input] = true // Side effect!
  return input.trim().toLowerCase()
}
```

### 2. Use Factory Functions

```typescript
// ✅ Good - Factory function
export function createPlugin(config: Config): HatagoPlugin {
  return ctx => {
    /* ... */
  }
}

// ❌ Bad - Class
export class Plugin {
  constructor(config: Config) {
    /* ... */
  }
}
```

### 3. Validate Inputs

```typescript
import { z } from 'zod'

const inputSchema = z.object({
  name: z.string().min(1),
  age: z.number().positive(),
})

export const validatedPlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'validated_tool',
    { inputSchema: zodToJsonSchema(inputSchema) },
    async args => {
      const validated = inputSchema.parse(args)
      // Now TypeScript knows the types
      return {
        content: [
          {
            type: 'text',
            text: `${validated.name} is ${validated.age} years old`,
          },
        ],
      }
    }
  )
}
```

### 4. Handle Errors Gracefully

```typescript
export const errorHandlingPlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'safe_tool',
    {
      /* schema */
    },
    async args => {
      try {
        const result = await riskyOperation(args)
        return { content: [{ type: 'text', text: result }] }
      } catch (error) {
        // Log error
        console.error('Tool failed:', error)

        // Return user-friendly error
        return {
          content: [
            {
              type: 'text',
              text: 'Operation failed. Please try again.',
            },
          ],
          isError: true,
        }
      }
    }
  )
}
```

## Publishing Your Plugin

### Package Structure

```
my-hatago-plugin/
├── src/
│   ├── index.ts        # Main plugin export
│   ├── utils.ts        # Pure utility functions
│   └── types.ts        # TypeScript types
├── tests/
│   └── plugin.test.ts  # Tests
├── package.json
├── tsconfig.json
└── README.md
```

### Package.json

```json
{
  "name": "@myorg/hatago-plugin-example",
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
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  }
}
```

### Export Pattern

```typescript
// src/index.ts

// Named export for the plugin
export const examplePlugin: HatagoPlugin = ctx => {
  // Plugin implementation
}

// Factory function for configuration
export function createExamplePlugin(config?: Config): HatagoPlugin {
  return ctx => {
    // Configurable plugin implementation
  }
}

// Export types
export type { Config, ExamplePluginOptions }
```

### Publishing

```bash
# Build
npm run build

# Test
npm test

# Publish
npm publish --access public
```

## Examples

### Complete Example Plugin

```typescript
import type { HatagoPlugin } from '@hatago/core'
import { z } from 'zod'

// Configuration type
interface WeatherPluginConfig {
  apiKey: string
  cacheTTL?: number
  units?: 'metric' | 'imperial'
}

// Input validation schema
const weatherSchema = z.object({
  city: z.string().min(1),
  country: z.string().length(2).optional(),
})

// Pure functions
function formatTemperature(temp: number, units: string): string {
  const symbol = units === 'metric' ? '°C' : '°F'
  return `${temp.toFixed(1)}${symbol}`
}

function buildApiUrl(city: string, country: string | undefined, apiKey: string): string {
  const location = country ? `${city},${country}` : city
  return `https://api.weather.com/v1/weather?q=${location}&key=${apiKey}`
}

// Factory function
export function createWeatherPlugin(config: WeatherPluginConfig): HatagoPlugin {
  const { apiKey, cacheTTL = 600000, units = 'metric' } = config

  // Simple cache
  const cache = new Map<string, { data: any; timestamp: number }>()

  return ctx => {
    ctx.server.registerTool(
      'get_weather',
      {
        description: 'Get weather for a city',
        inputSchema: zodToJsonSchema(weatherSchema),
      },
      async args => {
        const { city, country } = weatherSchema.parse(args)
        const cacheKey = `${city}-${country}`

        // Check cache
        const cached = cache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < cacheTTL) {
          return {
            content: [
              {
                type: 'text',
                text: formatWeatherResponse(cached.data, units),
              },
            ],
          }
        }

        // Fetch weather
        const url = buildApiUrl(city, country, apiKey)
        const response = await fetch(url)
        const data = await response.json()

        // Cache result
        cache.set(cacheKey, { data, timestamp: Date.now() })

        return {
          content: [
            {
              type: 'text',
              text: formatWeatherResponse(data, units),
            },
          ],
        }
      }
    )

    // Optional HTTP endpoint
    ctx.app.get('/weather/:city', async c => {
      const city = c.req.param('city')
      // Implementation
      return c.json({ city, weather: 'sunny' })
    })
  }
}

function formatWeatherResponse(data: any, units: string): string {
  const temp = formatTemperature(data.main.temp, units)
  return `Weather in ${data.name}: ${data.weather[0].description}, ${temp}`
}
```

## Next Steps

- Check out [example plugins](https://github.com/himorishige/hatago/tree/main/packages)
- Read the [API Reference](../api-reference.md)
- Learn about [publishing plugins](./publishing-plugins.md)
- Join the [community](https://github.com/himorishige/hatago/discussions)
