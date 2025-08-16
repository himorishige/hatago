# Hatago API Reference

Complete API reference for the Hatago MCP framework core functions and types.

## Core Functions

### `createApp`

Creates a new Hatago application instance.

```typescript
function createApp(config: AppConfig): Promise<{
  app: Hono
  server: McpServer
}>
```

#### Parameters

- `config: AppConfig` - Application configuration
  - `name: string` - Application name
  - `version: string` - Application version
  - `capabilities?: ServerCapabilities` - MCP server capabilities

#### Returns

Promise resolving to:
- `app: Hono` - Hono web framework instance
- `server: McpServer` - MCP server instance

#### Example

```typescript
const { app, server } = await createApp({
  name: 'my-mcp-server',
  version: '1.0.0'
})
```

### `loadPlugins`

Loads and applies plugins to the application.

```typescript
function loadPlugins(
  plugins: HatagoPlugin[],
  context: HatagoContext
): Promise<void>
```

#### Parameters

- `plugins: HatagoPlugin[]` - Array of plugins to load
- `context: HatagoContext` - Plugin context

#### Example

```typescript
await loadPlugins([myPlugin, anotherPlugin], {
  app,
  server,
  env: process.env
})
```

## Types

### `HatagoPlugin`

Plugin function type that extends Hatago functionality.

```typescript
type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>
```

#### Context Properties

- `app: Hono` - Hono instance for HTTP routes
- `server: McpServer` - MCP server for tools/resources
- `env?: Record<string, unknown>` - Environment variables
- `getBaseUrl?: (req: Request) => URL` - Helper to get base URL

#### Example

```typescript
const myPlugin: HatagoPlugin = (ctx) => {
  ctx.server.registerTool('my_tool', schema, handler)
  ctx.app.get('/my-route', routeHandler)
}
```

### `HatagoContext`

Context object passed to plugins.

```typescript
interface HatagoContext {
  app: Hono
  server: McpServer
  env?: Record<string, unknown>
  getBaseUrl?: (req: Request) => URL
}
```

### `AppConfig`

Configuration for creating an app.

```typescript
interface AppConfig {
  name: string
  version: string
  capabilities?: ServerCapabilities
}
```

## Adapter Functions

### Node.js Adapter

#### `createNodeAdapter`

Creates a Node.js HTTP server adapter.

```typescript
function createNodeAdapter(options: NodeAdapterOptions): NodeAdapter
```

##### Options

```typescript
interface NodeAdapterOptions {
  app: Hono
  port?: number           // Default: 8787
  hostname?: string       // Default: 'localhost'
  onListen?: (info: AddressInfo) => void
}
```

##### Methods

```typescript
interface NodeAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  server: Server  // Node.js HTTP server instance
}
```

##### Example

```typescript
const adapter = createNodeAdapter({
  app,
  port: 3000,
  onListen: (info) => {
    console.log(`Server running on port ${info.port}`)
  }
})

await adapter.start()
```

### Workers Adapter

#### `createWorkersAdapter`

Creates a Cloudflare Workers adapter.

```typescript
function createWorkersAdapter(app: Hono): WorkersAdapter
```

##### Returns

```typescript
interface WorkersAdapter {
  fetch(request: Request, env?: Env, ctx?: ExecutionContext): Promise<Response>
}
```

##### Example

```typescript
export default createWorkersAdapter(app)
```

## Logger Functions

### `createLogger`

Creates a basic logger instance.

```typescript
function createLogger(config?: LoggerConfig): Logger
```

#### Config

```typescript
interface LoggerConfig {
  level: LogLevel  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  format?: 'json' | 'pretty'
}
```

#### Methods

```typescript
interface Logger {
  trace(message: string, meta?: object): void
  debug(message: string, meta?: object): void
  info(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  error(message: string, meta?: object): void
  fatal(message: string, meta?: object): void
}
```

### `createSecureLogger`

Creates a logger with PII masking.

```typescript
function createSecureLogger(config?: SecureLoggerConfig): SecureLogger
```

#### Config

```typescript
interface SecureLoggerConfig extends LoggerConfig {
  maskingEnabled?: boolean
  redactKeys?: string[]
}
```

## MCP Server Methods

### `server.registerTool`

Registers an MCP tool.

```typescript
server.registerTool(
  name: string,
  schema: ToolSchema,
  handler: ToolHandler
): void
```

#### Parameters

- `name: string` - Tool name (use underscores for MCP compliance)
- `schema: ToolSchema` - Tool input schema
- `handler: ToolHandler` - Tool implementation

#### Schema

```typescript
interface ToolSchema {
  description: string
  inputSchema: JSONSchema
}
```

#### Handler

```typescript
type ToolHandler = (args: any, meta?: {
  progressToken?: string
}) => Promise<ToolResult>

interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}
```

#### Example

```typescript
server.registerTool(
  'calculate_sum',
  {
    description: 'Calculate the sum of two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  },
  async (args) => {
    const sum = args.a + args.b
    return {
      content: [{
        type: 'text',
        text: `The sum is ${sum}`
      }]
    }
  }
)
```

### `server.registerResource`

Registers an MCP resource.

```typescript
server.registerResource(
  uri: string,
  metadata: ResourceMetadata,
  handler: ResourceHandler
): void
```

#### Parameters

```typescript
interface ResourceMetadata {
  name: string
  description?: string
  mimeType?: string
}

type ResourceHandler = () => Promise<ResourceContent>

interface ResourceContent {
  contents: Array<{
    type: 'text' | 'blob'
    text?: string
    blob?: string
  }>
}
```

#### Example

```typescript
server.registerResource(
  'config://app',
  {
    name: 'Application Config',
    description: 'Current app configuration',
    mimeType: 'application/json'
  },
  async () => ({
    contents: [{
      type: 'text',
      text: JSON.stringify(config, null, 2)
    }]
  })
)
```

### `server.registerPrompt`

Registers an MCP prompt template.

```typescript
server.registerPrompt(
  name: string,
  metadata: PromptMetadata,
  handler: PromptHandler
): void
```

#### Parameters

```typescript
interface PromptMetadata {
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

type PromptHandler = (args: any) => Promise<PromptContent>

interface PromptContent {
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: {
      type: 'text'
      text: string
    }
  }>
}
```

## HTTP Route Methods (Hono)

### `app.get` / `app.post` / `app.put` / `app.delete`

Register HTTP routes.

```typescript
app.get(path: string, handler: Handler): void
app.post(path: string, handler: Handler): void
app.put(path: string, handler: Handler): void
app.delete(path: string, handler: Handler): void
```

#### Handler

```typescript
type Handler = (c: Context) => Response | Promise<Response>
```

#### Context Methods

```typescript
interface Context {
  req: HonoRequest       // Request object
  json(object: any): Response
  text(text: string): Response
  html(html: string): Response
  redirect(url: string, status?: number): Response
  header(name: string, value: string): void
  status(code: number): void
  get(key: string): any  // Get context variable
  set(key: string, value: any): void
}
```

#### Example

```typescript
app.get('/health', (c) => {
  return c.json({ status: 'healthy' })
})

app.post('/api/data', async (c) => {
  const body = await c.req.json()
  // Process data
  return c.json({ success: true })
})
```

## Utility Functions

### `compose`

Composes multiple functions into one.

```typescript
function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T
```

#### Example

```typescript
const process = compose(
  validate,
  transform,
  format
)

const result = process(input)
```

### `pipe`

Pipes value through multiple functions.

```typescript
function pipe<T>(value: T, ...fns: Array<(arg: T) => T>): T
```

#### Example

```typescript
const result = pipe(
  input,
  validate,
  transform,
  format
)
```

### `memoize`

Memoizes function results.

```typescript
function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options?: MemoizeOptions
): T
```

#### Options

```typescript
interface MemoizeOptions {
  maxSize?: number      // Maximum cache size
  ttl?: number         // Time to live in ms
  keyGenerator?: (...args: any[]) => string
}
```

## Environment Variables

### Core Variables

- `NODE_ENV` - Environment mode (`development` | `production`)
- `LOG_LEVEL` - Logging level
- `LOG_FORMAT` - Log format (`json` | `pretty`)
- `PORT` - Server port (Node.js adapter)
- `HOSTNAME` - Server hostname

### Plugin Variables

Plugins may use additional environment variables:

```typescript
const config = {
  apiKey: process.env.API_KEY,
  endpoint: process.env.API_ENDPOINT || 'https://api.example.com'
}
```

## Error Handling

### Error Types

```typescript
class HatagoError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

class ValidationError extends HatagoError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
  }
}

class PluginError extends HatagoError {
  constructor(message: string) {
    super(message, 'PLUGIN_ERROR')
  }
}
```

### Error Handling in Plugins

```typescript
const myPlugin: HatagoPlugin = (ctx) => {
  ctx.server.registerTool(
    'my_tool',
    schema,
    async (args) => {
      try {
        // Tool logic
        return { content: [{ type: 'text', text: 'Success' }] }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        }
      }
    }
  )
}
```

## TypeScript Support

### Type Exports

```typescript
// Core types
export type { HatagoPlugin, HatagoContext, AppConfig }

// Adapter types
export type { NodeAdapter, NodeAdapterOptions }
export type { WorkersAdapter }

// Logger types
export type { Logger, LogLevel, LoggerConfig }
export type { SecureLogger, SecureLoggerConfig }

// MCP types
export type { ToolSchema, ToolHandler, ToolResult }
export type { ResourceMetadata, ResourceHandler }
export type { PromptMetadata, PromptHandler }
```

### Generic Types

```typescript
// Plugin with configuration
export type ConfigurablePlugin<T> = (config: T) => HatagoPlugin

// Factory function pattern
export type Factory<T, R> = (config: T) => R
```

## Best Practices

### Plugin Development

1. **Use factory functions** for plugin creation
2. **Validate inputs** with schemas
3. **Handle errors gracefully**
4. **Log important events**
5. **Clean up resources** when needed

### Performance

1. **Memoize expensive operations**
2. **Use connection pooling**
3. **Implement caching** where appropriate
4. **Lazy load** large dependencies

### Security

1. **Validate all inputs**
2. **Sanitize outputs**
3. **Use environment variables** for secrets
4. **Implement rate limiting**
5. **Log security events**