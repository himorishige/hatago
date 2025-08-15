# Hatago CLI API Reference

This document provides detailed API reference for Hatago CLI components and programmatic usage.

## Table of Contents

- [CLI API](#cli-api)
- [Configuration API](#configuration-api)
- [Template Engine API](#template-engine-api)
- [Programmatic Usage](#programmatic-usage)
- [Plugin Development API](#plugin-development-api)

## CLI API

### Command Structure

All CLI commands follow the pattern:

```bash
hatago [global-options] <command> [command-options] [arguments]
```

### Global Options

| Option      | Alias | Type    | Description           |
| ----------- | ----- | ------- | --------------------- |
| `--verbose` | `-v`  | boolean | Enable verbose output |
| `--json`    |       | boolean | Output in JSON format |
| `--help`    | `-h`  | boolean | Show help             |
| `--version` | `-V`  | boolean | Show version          |

### Command Exit Codes

| Code | Description         |
| ---- | ------------------- |
| 0    | Success             |
| 1    | General error       |
| 2    | Invalid arguments   |
| 3    | Configuration error |
| 4    | Template error      |
| 5    | Network error       |

### Environment Variables

| Variable             | Description           | Default     |
| -------------------- | --------------------- | ----------- |
| `HATAGO_VERBOSE`     | Enable verbose output | false       |
| `HATAGO_JSON_OUTPUT` | Enable JSON output    | false       |
| `NODE_ENV`           | Environment mode      | development |

## Configuration API

### HatagoConfig Interface

```typescript
interface HatagoConfig {
  $schema?: string
  server?: ServerConfig
  proxy?: ProxyConfig
  logging?: LoggingConfig
  security?: SecurityConfig
}
```

### ServerConfig

```typescript
interface ServerConfig {
  port: number
  hostname: string
  cors: boolean
  timeout: number
}
```

**Default:**

```json
{
  "port": 8787,
  "hostname": "localhost",
  "cors": true,
  "timeout": 30000
}
```

### ProxyConfig

```typescript
interface ProxyConfig {
  servers: ProxyServerConfig[]
  namespaceStrategy: 'prefix' | 'suffix' | 'none'
  conflictResolution: 'error' | 'warn' | 'override'
  namespace: NamespaceConfig
  connectionPool?: ConnectionPoolConfig
}
```

### ProxyServerConfig

```typescript
interface ProxyServerConfig {
  id: string
  endpoint: string
  namespace?: string
  description?: string
  auth?: AuthConfig
  tools?: ToolMappingConfig
  timeout?: number
  retry?: RetryConfig
  healthCheck?: HealthCheckConfig
}
```

### AuthConfig

```typescript
interface AuthConfig {
  type: 'bearer' | 'basic' | 'custom'
  token?: string
  username?: string
  password?: string
  headers?: Record<string, string>
}
```

### ToolMappingConfig

```typescript
interface ToolMappingConfig {
  include?: string[]
  exclude?: string[]
  rename?: Record<string, string>
}
```

### LoggingConfig

```typescript
interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug'
  format: 'json' | 'pretty' | 'simple'
  output: 'console' | 'file'
  file?: string
}
```

### SecurityConfig

```typescript
interface SecurityConfig {
  requireAuth: boolean
  allowedOrigins: string[]
  rateLimit?: RateLimitConfig
}
```

## Template Engine API

### TemplateEngine Class

```typescript
class TemplateEngine {
  constructor()

  loadTemplateConfig(templateDir: string): TemplateConfig
  renderTemplate(templatePath: string, context: TemplateContext): string
  generateFromTemplate(
    templateDir: string,
    outputDir: string,
    context: TemplateContext,
    options?: GenerateOptions
  ): TemplateResult
  listTemplates(templatesDir: string): TemplateConfig[]
  findTemplate(templatesDir: string, name: string): string | null
  validateTemplate(templateDir: string): ValidationResult
}
```

### TemplateConfig Interface

```typescript
interface TemplateConfig {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  author: string
  version: string
  files: TemplateFile[]
  prompts: TemplatePrompt[]
  dependencies?: string[]
  devDependencies?: string[]
}
```

### TemplateFile Interface

```typescript
interface TemplateFile {
  template: string
  output: string
  description: string
  optional?: boolean
}
```

### TemplatePrompt Interface

```typescript
interface TemplatePrompt {
  name: string
  type: 'input' | 'confirm' | 'select' | 'array'
  message: string
  default?: any
  choices?: string[]
  when?: string
  required?: boolean
  itemPrompts?: TemplatePrompt[]
}
```

### TemplateContext Type

```typescript
type TemplateContext = Record<string, any>
```

### Handlebars Helpers

#### String Helpers

```typescript
// Convert to camelCase
{{camelCase "hello world"}} // → "helloWorld"

// Convert to kebab-case
{{kebabCase "Hello World"}} // → "hello-world"

// Convert to snake_case
{{snakeCase "Hello World"}} // → "hello_world"

// Convert to Title Case
{{titleCase "hello world"}} // → "Hello World"

// Convert to UPPERCASE
{{toUpperCase "hello"}} // → "HELLO"

// Convert to lowercase
{{toLowerCase "HELLO"}} // → "hello"
```

#### Date Helpers

```typescript
// Current timestamp
{{timestamp}} // → "2025-08-15T08:00:00.000Z"

// Formatted date
{{date}} // → "2025-08-15"
{{date "short"}} // → "8/15/2025"
```

#### Conditional Helpers

```typescript
// Equality check
{{#if (eq status "active")}}Active{{/if}}

// Not equal
{{#if (ne status "inactive")}}Not inactive{{/if}}

// Greater than
{{#if (gt count 5)}}More than 5{{/if}}

// Less than
{{#if (lt count 10)}}Less than 10{{/if}}
```

#### Array Helpers

```typescript
// Array length
{{length items}} // → 3

// Join array
{{join items ", "}} // → "item1, item2, item3"
```

#### JSON Helper

```typescript
// Convert to JSON
{{json data}} // → formatted JSON string
{{json data 0}} // → compact JSON
```

## Programmatic Usage

### Using Configuration Loader

```typescript
import { loadConfig, validateConfig } from '@hatago/config'

// Load configuration
const { config, filepath } = await loadConfig({
  searchFrom: process.cwd(),
  validate: true,
})

// Validate configuration
try {
  const validConfig = validateConfig(config)
  console.log('Configuration is valid')
} catch (error) {
  console.error('Validation failed:', error.message)
}
```

### Using Template Engine

```typescript
import { TemplateEngine } from '@hatago/config'

const engine = new TemplateEngine()

// List available templates
const templates = engine.listTemplates('./templates')
console.log(
  'Available templates:',
  templates.map(t => t.name)
)

// Generate from template
const result = engine.generateFromTemplate('./templates/plugins/basic', './output', {
  name: 'MyPlugin',
  description: 'A custom plugin',
  author: 'Developer',
})

console.log(
  'Generated files:',
  result.files.map(f => f.path)
)
```

### Configuration Management

```typescript
import { loadConfig, diagnoseConfig, generateConfigFixes, formatDiagnostics } from '@hatago/config'

async function manageConfig() {
  // Load configuration
  const { config } = await loadConfig()

  // Run diagnostics
  const report = diagnoseConfig(config)

  if (report.hasErrors) {
    console.log(formatDiagnostics(report))

    // Try to fix issues
    if (report.canAutoFix) {
      const fixedConfig = generateConfigFixes(config)
      console.log('Applied fixes:', fixedConfig)
    }
  }
}
```

### Custom CLI Commands

```typescript
import { Command } from 'commander'
import { TemplateEngine } from '@hatago/config'

const program = new Command()

program
  .command('my-command')
  .description('My custom command')
  .argument('<name>', 'Component name')
  .option('--template <name>', 'Template to use')
  .action(async (name, options) => {
    const engine = new TemplateEngine()

    const templateDir = engine.findTemplate('./templates', options.template)
    if (!templateDir) {
      console.error('Template not found')
      process.exit(1)
    }

    const result = engine.generateFromTemplate(templateDir, './output', { name })

    console.log('Generated:', result.files.length, 'files')
  })

program.parse()
```

## Plugin Development API

### HatagoPlugin Interface

```typescript
interface HatagoPlugin {
  (context: HatagoContext): void | Promise<void>
}

interface HatagoContext {
  app: Hono
  server: McpServer
  env?: Record<string, unknown>
  getBaseUrl: (req: Request) => URL
}
```

### Plugin Example

```typescript
import type { HatagoPlugin } from '@hatago/core'

export const myPlugin: HatagoPlugin = ({ server, app, env }) => {
  // Register MCP tool
  server.registerTool(
    {
      name: 'my-tool',
      description: 'A custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
    },
    async ({ input }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Processed: ${input}`,
          },
        ],
      }
    }
  )

  // Register HTTP route
  app.get('/my-endpoint', c => {
    return c.json({ message: 'Hello from plugin' })
  })

  // Use environment variables
  const apiKey = env?.MY_API_KEY
  if (!apiKey) {
    throw new Error('MY_API_KEY environment variable is required')
  }
}
```

### Tool Registration API

```typescript
server.registerTool({
  name: string
  description: string
  inputSchema: JSONSchema
}, handler: (args: any) => Promise<ToolResult>)
```

### Resource Registration API

```typescript
server.registerResource({
  uri: string
  name: string
  description: string
  mimeType: string
}, handler: () => Promise<ResourceResult>)
```

### HTTP Route API

```typescript
// HTTP methods
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
app.patch(path, handler)

// Middleware
app.use(path, middleware)
```

### Context Helpers

```typescript
// Get base URL
const baseUrl = getBaseUrl(request)

// Environment access
const config = {
  apiKey: env?.API_KEY,
  debug: env?.NODE_ENV === 'development',
}
```

### Error Handling

```typescript
// Tool errors
throw new McpError('INVALID_REQUEST', 'Invalid input provided')

// HTTP errors
return c.json({ error: 'Not found' }, 404)

// Plugin initialization errors
if (!requiredConfig) {
  throw new Error('Required configuration missing')
}
```

### Testing Plugins

```typescript
import { describe, it, expect } from 'vitest'
import { McpServer } from '@hono/mcp'
import { Hono } from 'hono'
import { myPlugin } from './my-plugin'

describe('My Plugin', () => {
  it('should register tools', () => {
    const app = new Hono()
    const server = new McpServer({
      name: 'test',
      version: '1.0.0',
    })

    myPlugin({
      app,
      server,
      env: { MY_API_KEY: 'test-key' },
      getBaseUrl: () => new URL('http://localhost:8787'),
    })

    const tools = server.getAvailableTools()
    expect(tools).toContainEqual(expect.objectContaining({ name: 'my-tool' }))
  })
})
```

---

_This API reference covers Hatago CLI v0.1.0. For the latest updates, visit [hatago.dev](https://hatago.dev)._
