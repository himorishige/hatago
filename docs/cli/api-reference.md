# Hatago CLI API Reference

Programmatic API reference for the Hatago CLI package.

## Programmatic Usage

The CLI can be used programmatically in Node.js applications.

```javascript
import { init, dev, createPlugin, scaffold } from '@hatago/cli'
```

## Functions

### `init(projectName, options)`

Initialize a new Hatago project programmatically.

```typescript
function init(
  projectName: string,
  options?: InitOptions
): Promise<void>
```

#### Options

```typescript
interface InitOptions {
  template?: 'basic' | 'node-http' | 'workers' | 'stdio-only'
  force?: boolean
  skipInstall?: boolean
  packageManager?: 'npm' | 'pnpm' | 'yarn'
}
```

#### Example

```javascript
import { init } from '@hatago/cli'

await init('my-project', {
  template: 'node-http',
  skipInstall: false
})
```

### `dev(options)`

Start development server programmatically.

```typescript
function dev(options?: DevOptions): Promise<DevServer>
```

#### Options

```typescript
interface DevOptions {
  port?: number
  hostname?: string
  stdio?: boolean
  watch?: boolean
  env?: string
  cwd?: string
}
```

#### Returns

```typescript
interface DevServer {
  stop(): Promise<void>
  restart(): Promise<void>
  port: number
  url: string
}
```

#### Example

```javascript
import { dev } from '@hatago/cli'

const server = await dev({
  port: 3000,
  watch: true
})

// Later...
await server.stop()
```

### `createPlugin(name, options)`

Generate a plugin programmatically.

```typescript
function createPlugin(
  name: string,
  options?: CreatePluginOptions
): Promise<void>
```

#### Options

```typescript
interface CreatePluginOptions {
  template?: 'basic' | 'mcp-wrapper' | 'oauth'
  output?: string
  interactive?: boolean
}
```

### `scaffold(template, name, options)`

Generate boilerplate code.

```typescript
function scaffold(
  template: string,
  name?: string,
  options?: ScaffoldOptions
): Promise<void>
```

#### Options

```typescript
interface ScaffoldOptions {
  output?: string
  force?: boolean
}
```

## Configuration

### `loadConfig(path?)`

Load Hatago configuration.

```typescript
function loadConfig(path?: string): Promise<HatagoConfig>
```

#### Returns

```typescript
interface HatagoConfig {
  name: string
  version: string
  runtime?: 'node' | 'workers' | 'deno' | 'bun'
  plugins?: string[]
  server?: {
    port?: number
    hostname?: string
  }
  env?: Record<string, Record<string, string>>
}
```

### `validateConfig(config)`

Validate configuration object.

```typescript
function validateConfig(config: unknown): config is HatagoConfig
```

### `writeConfig(config, path?)`

Write configuration to file.

```typescript
function writeConfig(
  config: HatagoConfig,
  path?: string
): Promise<void>
```

## Templates

### `getTemplates()`

Get available templates.

```typescript
function getTemplates(): Promise<Template[]>
```

#### Returns

```typescript
interface Template {
  name: string
  description: string
  category: 'project' | 'plugin' | 'scaffold'
  path: string
}
```

### `renderTemplate(template, context)`

Render a template with context.

```typescript
function renderTemplate(
  template: string,
  context: Record<string, any>
): Promise<string>
```

## Utilities

### `checkVersion()`

Check for CLI updates.

```typescript
function checkVersion(): Promise<{
  current: string
  latest: string
  updateAvailable: boolean
}>
```

### `getPackageManager()`

Detect package manager.

```typescript
function getPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun'
```

### `runCommand(command, args, options)`

Execute shell commands.

```typescript
function runCommand(
  command: string,
  args?: string[],
  options?: ExecOptions
): Promise<{ stdout: string; stderr: string }>
```

## Error Handling

### Error Classes

```typescript
class CLIError extends Error {
  constructor(message: string, code: string)
}

class InitError extends CLIError {}
class DevError extends CLIError {}
class PluginError extends CLIError {}
class ConfigError extends CLIError {}
```

### Error Codes

- `INIT_DIR_EXISTS` - Directory already exists
- `INIT_TEMPLATE_NOT_FOUND` - Template not found
- `DEV_PORT_IN_USE` - Port already in use
- `CONFIG_INVALID` - Invalid configuration
- `PLUGIN_EXISTS` - Plugin already exists

## Events

The CLI emits events during operations:

```typescript
import { events } from '@hatago/cli'

events.on('init:start', (project) => {
  console.log(`Initializing ${project}...`)
})

events.on('dev:restart', () => {
  console.log('Server restarting...')
})

events.on('error', (error) => {
  console.error('CLI Error:', error)
})
```

### Available Events

- `init:start` - Project initialization started
- `init:complete` - Project initialization completed
- `dev:start` - Development server started
- `dev:stop` - Development server stopped
- `dev:restart` - Development server restarted
- `plugin:created` - Plugin created
- `scaffold:complete` - Scaffolding completed
- `error` - Error occurred

## Environment Variables

Variables that affect CLI behavior:

- `HATAGO_CLI_HOME` - CLI home directory (default: `~/.hatago`)
- `HATAGO_TEMPLATES` - Custom templates directory
- `HATAGO_REGISTRY` - NPM registry URL
- `HATAGO_TELEMETRY` - Enable/disable telemetry
- `NO_COLOR` - Disable colored output
- `CI` - Continuous integration mode

## Complete Example

```javascript
import { 
  init, 
  dev, 
  createPlugin, 
  loadConfig,
  events 
} from '@hatago/cli'

async function setupProject() {
  // Listen for events
  events.on('init:complete', () => {
    console.log('Project initialized!')
  })

  // Initialize project
  await init('my-app', {
    template: 'node-http',
    skipInstall: false
  })

  // Change to project directory
  process.chdir('my-app')

  // Create a plugin
  await createPlugin('my-feature', {
    template: 'basic'
  })

  // Load and modify config
  const config = await loadConfig()
  config.plugins.push('./src/plugins/my-feature')
  await writeConfig(config)

  // Start development server
  const server = await dev({
    port: 3000,
    watch: true
  })

  console.log(`Server running at ${server.url}`)

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop()
    process.exit(0)
  })
}

setupProject().catch(console.error)
```

## TypeScript Support

All functions are fully typed. Import types:

```typescript
import type {
  InitOptions,
  DevOptions,
  HatagoConfig,
  Template,
  CLIError
} from '@hatago/cli'
```

## Related Documentation

- [CLI Command Reference](./README.md)
- [Getting Started](../getting-started.md)
- [Plugin Development](../guides/plugin-development.md)