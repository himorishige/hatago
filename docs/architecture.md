# Hatago Architecture

Hatago follows a **functional programming architecture** with immutable data structures, pure functions, and composition-based design patterns.

## Core Principles

### 1. Functional Programming First

Hatago embraces functional programming principles:

- **Pure Functions**: Functions without side effects
- **Immutability**: Data structures are never mutated
- **Composition**: Building complex behavior from simple functions
- **Factory Pattern**: Using `create*` functions instead of classes

```typescript
// ❌ Old class-based approach
class Logger {
  constructor(private config: Config) {}
  log(message: string) { /* ... */ }
}

// ✅ Functional approach
function createLogger(config: Config) {
  return {
    log: (message: string) => { /* pure function */ }
  }
}
```

### 2. Plugin-Based Architecture

Everything in Hatago is a plugin:

```typescript
type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

type HatagoContext = {
  app: Hono           // HTTP framework instance
  server: McpServer   // MCP server instance
  env?: Record<string, unknown>  // Environment variables
}
```

### 3. Runtime Agnostic

Hatago runs on multiple JavaScript runtimes:

- **Node.js** - Full feature support
- **Cloudflare Workers** - Edge deployment
- **Deno** - Secure runtime
- **Bun** - Fast all-in-one runtime

## Architecture Layers

```
┌─────────────────────────────────────────┐
│           Application Layer             │
│         (hatago-server, apps)           │
├─────────────────────────────────────────┤
│            Plugin Layer                 │
│    (plugin-*, custom plugins)           │
├─────────────────────────────────────────┤
│            Core Layer                   │
│    (@hatago/core - orchestration)       │
├─────────────────────────────────────────┤
│          Transport Layer                │
│    (hono-mcp, stdio, http)             │
├─────────────────────────────────────────┤
│          Adapter Layer                  │
│   (adapter-node, adapter-workers)       │
└─────────────────────────────────────────┘
```

## Core Components

### 1. Core Framework (`@hatago/core`)

The core provides the foundation:

```typescript
// Factory function for creating apps
export function createApp(config: AppConfig): Promise<{
  app: Hono
  server: McpServer
}>

// Plugin loading system
export function loadPlugins(
  plugins: HatagoPlugin[],
  context: HatagoContext
): Promise<void>
```

### 2. Adapters

Adapters provide runtime-specific implementations:

```typescript
// Node.js adapter
export function createNodeAdapter(options: NodeAdapterOptions) {
  return {
    start: async () => { /* start HTTP server */ },
    stop: async () => { /* graceful shutdown */ }
  }
}

// Workers adapter
export function createWorkersAdapter(app: Hono) {
  return {
    fetch: (request: Request) => app.fetch(request)
  }
}
```

### 3. Transport Layer

MCP communication through different transports:

```typescript
// HTTP Transport (via Hono)
app.post('/mcp', mcpHandler)

// stdio Transport
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 4. Plugin System

Plugins extend functionality:

```typescript
// Plugin factory pattern
export function createLoggerPlugin(config?: LoggerConfig): HatagoPlugin {
  return (ctx) => {
    const logger = createLogger(config)
    
    // Register MCP tool
    ctx.server.registerTool(
      'log',
      { /* schema */ },
      async (args) => {
        logger.log(args.message)
        return { content: [{ type: 'text', text: 'Logged' }] }
      }
    )
  }
}
```

## Data Flow

### Request Processing

```
Client Request
     ↓
HTTP/stdio Transport
     ↓
Hono Router (/mcp endpoint)
     ↓
MCP Protocol Handler
     ↓
Tool/Resource Execution
     ↓
Response Formatting
     ↓
Client Response
```

### Plugin Initialization

```
App Creation
     ↓
Load Configuration
     ↓
Initialize Core Services
     ↓
Load Plugins (sequential)
     ↓
Register Tools/Resources
     ↓
Start Transport
     ↓
Ready to Serve
```

## Functional Patterns

### 1. Factory Functions

All object creation uses factory functions:

```typescript
// Creating services
const logger = createLogger(config)
const validator = createValidator(schema)
const limiter = createRateLimiter(options)

// Creating plugins
const plugin = createPlugin(config)
```

### 2. Higher-Order Functions

Functions that return functions:

```typescript
// Middleware factory
function createMiddleware(config: Config) {
  return (next: Handler) => {
    return async (ctx: Context) => {
      // Pre-processing
      const result = await next(ctx)
      // Post-processing
      return result
    }
  }
}
```

### 3. Pure Function Composition

Building complex behavior from simple functions:

```typescript
// Compose validators
const validateRequest = compose(
  validateSchema,
  validateAuth,
  validateRateLimit
)

// Compose transformers
const processData = pipe(
  normalize,
  validate,
  transform,
  format
)
```

### 4. Immutable State Management

State changes create new objects:

```typescript
// Reducer pattern for state updates
type Action = 
  | { type: 'ADD_REQUEST' }
  | { type: 'COMPLETE_REQUEST' }
  | { type: 'FAIL_REQUEST', error: Error }

function stateReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_REQUEST':
      return { ...state, pending: state.pending + 1 }
    case 'COMPLETE_REQUEST':
      return { ...state, pending: state.pending - 1, completed: state.completed + 1 }
    case 'FAIL_REQUEST':
      return { ...state, pending: state.pending - 1, failed: state.failed + 1 }
    default:
      return state
  }
}
```

## Security Architecture

### Plugin Isolation

Plugins run in isolated contexts:

```typescript
// Plugins only access provided capabilities
type PluginContext = {
  server: McpServer  // Limited MCP server interface
  app: Hono         // Scoped HTTP router
  env?: Record<string, unknown>  // Filtered environment
}
```

### Input Validation

All inputs are validated:

```typescript
// Zod schema validation
const schema = z.object({
  name: z.string(),
  age: z.number().positive()
})

// Automatic validation in tools
server.registerTool(
  'my_tool',
  { inputSchema: zodToJsonSchema(schema) },
  async (args) => {
    const validated = schema.parse(args)
    // Process validated input
  }
)
```

## Performance Optimizations

### 1. Lazy Loading

Plugins and resources load on demand:

```typescript
// Lazy plugin loading
async function loadPlugin(name: string) {
  const module = await import(`@hatago/plugin-${name}`)
  return module.default
}
```

### 2. Connection Pooling

Efficient resource management:

```typescript
// Reusable connection pool
const pool = createConnectionPool({
  max: 10,
  idleTimeout: 30000
})
```

### 3. Caching

Strategic caching for performance:

```typescript
// Memoized functions
const memoizedExpensiveOperation = memoize(expensiveOperation)

// LRU cache for responses
const cache = createLRUCache({ maxSize: 100 })
```

## Testing Strategy

### Unit Testing

Pure functions are easily testable:

```typescript
describe('createLogger', () => {
  it('should create logger with config', () => {
    const logger = createLogger({ level: 'info' })
    expect(logger.log).toBeDefined()
  })
})
```

### Integration Testing

Test plugin interactions:

```typescript
describe('Plugin Integration', () => {
  it('should register tools', async () => {
    const { server } = await createApp({ name: 'test' })
    await myPlugin({ server })
    
    const tools = await server.listTools()
    expect(tools).toContain('my_tool')
  })
})
```

## Deployment Architecture

### Node.js Deployment

```
Load Balancer
     ↓
Node.js Instances (clustered)
     ↓
Hatago Server
     ↓
Plugins
```

### Edge Deployment (Workers)

```
Cloudflare Edge Network
     ↓
Worker Instance
     ↓
Hatago Worker Adapter
     ↓
Plugins (KV-backed)
```

### Container Deployment

```
Kubernetes Cluster
     ↓
Pod (Hatago Container)
     ↓
Service Mesh
     ↓
External Services
```

## Best Practices

### 1. Keep Functions Pure

```typescript
// ✅ Pure function
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ❌ Impure function
let total = 0
function addToTotal(item: Item): void {
  total += item.price  // Mutates external state
}
```

### 2. Use Composition Over Inheritance

```typescript
// ✅ Composition
const enhancedLogger = compose(
  withTimestamp,
  withContext,
  withRedaction
)(baseLogger)

// ❌ Inheritance
class EnhancedLogger extends BaseLogger {
  // Avoid class hierarchies
}
```

### 3. Prefer Immutability

```typescript
// ✅ Immutable update
const newState = { ...state, count: state.count + 1 }

// ❌ Mutation
state.count++
```

### 4. Use Factory Functions

```typescript
// ✅ Factory function
export function createService(config: Config) {
  return { /* service implementation */ }
}

// ❌ Class constructor
export class Service {
  constructor(config: Config) { /* ... */ }
}
```

## Future Considerations

### WebAssembly Support

Future versions may support WASM plugins for:
- Performance-critical operations
- Language-agnostic plugins
- Secure sandboxing

### Distributed Architecture

Potential for distributed MCP servers:
- Service mesh integration
- Multi-region deployment
- Federated plugin registry

## Summary

Hatago's functional architecture provides:

- **Simplicity**: Pure functions are easier to understand
- **Testability**: No hidden state makes testing straightforward
- **Reliability**: Immutability prevents unexpected mutations
- **Composability**: Build complex features from simple parts
- **Portability**: Runtime-agnostic design works everywhere

This architecture ensures Hatago remains lightweight, fast, and simple while being powerful enough for production use cases.