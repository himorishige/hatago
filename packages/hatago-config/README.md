# @hatago/config

Configuration management system for Hatago MCP framework.

## Overview

The configuration package provides a robust, type-safe configuration management system for Hatago applications. It supports multiple configuration sources, environment-specific settings, validation, and runtime configuration updates.

## Features

- **🔧 Multiple Sources**: JSON, JSONC, environment variables, and programmatic config
- **✅ Type Safety**: Full TypeScript support with schema validation
- **🌍 Environment-Aware**: Environment-specific configuration overrides
- **📝 Validation**: Zod-based schema validation with helpful error messages
- **🔄 Hot Reload**: Runtime configuration updates during development
- **📄 Templates**: Configuration templates for common setups

## Installation

```bash
npm install @hatago/config
```

## Quick Start

### Basic Usage

```typescript
import { loadConfig } from '@hatago/config'

// Load configuration from hatago.config.json
const config = await loadConfig()

console.log(config.name) // Project name
console.log(config.plugins) // Plugin list
console.log(config.env.LOG_LEVEL) // Environment variables
```

### With Custom Path

```typescript
import { loadConfig } from '@hatago/config'

// Load from custom location
const config = await loadConfig('./config/hatago.config.json')

// Load with environment override
const config = await loadConfig('./hatago.config.json', {
  environment: 'production',
})
```

## Configuration Files

### Basic Configuration

```json
// hatago.config.json
{
  "$schema": "https://hatago.dev/schema/config.json",
  "name": "my-mcp-server",
  "version": "1.0.0",
  "runtime": "node",
  "transport": ["http", "stdio"],
  "plugins": ["./plugins/custom-plugin.js", "@hatago/plugin-rate-limit"],
  "server": {
    "port": 8787,
    "host": "localhost"
  }
}
```

### Environment-Specific Configuration

```json
// hatago.config.json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "environments": {
    "development": {
      "server": {
        "port": 3000
      },
      "env": {
        "LOG_LEVEL": "debug",
        "REQUIRE_AUTH": "false"
      }
    },
    "staging": {
      "server": {
        "port": 8787
      },
      "env": {
        "LOG_LEVEL": "info",
        "REQUIRE_AUTH": "true"
      }
    },
    "production": {
      "server": {
        "host": "0.0.0.0",
        "port": 8787
      },
      "env": {
        "LOG_LEVEL": "warn",
        "REQUIRE_AUTH": "true",
        "LOG_FORMAT": "json"
      }
    }
  }
}
```

### JSONC Support

```jsonc
// hatago.config.jsonc
{
  // Project metadata
  "name": "my-mcp-server",
  "version": "1.0.0",

  // Runtime configuration
  "runtime": "node", // node | workers | deno | bun

  /* Transport configuration */
  "transport": ["http", "stdio"],

  // Plugin configuration
  "plugins": [
    // Local plugins
    "./plugins/weather.js",

    // NPM packages
    "@hatago/plugin-rate-limit",

    // Plugin with configuration
    {
      "name": "@hatago/plugin-oauth",
      "config": {
        "providers": ["github", "google"],
      },
    },
  ],
}
```

## Schema Validation

### Configuration Schema

```typescript
import { HatagoConfigSchema } from '@hatago/config'
import { z } from 'zod'

// Validate configuration manually
const result = HatagoConfigSchema.safeParse(rawConfig)
if (!result.success) {
  console.error('Configuration validation failed:', result.error)
}

// Extend schema for custom validation
const CustomConfigSchema = HatagoConfigSchema.extend({
  customField: z.string().optional(),
})
```

### Plugin Configuration Schema

```typescript
import { definePluginConfig } from '@hatago/config'

// Define plugin-specific configuration
const MyPluginConfig = definePluginConfig({
  apiKey: z.string(),
  timeout: z.number().default(5000),
  retries: z.number().min(0).max(10).default(3),
})

// Use in plugin
export const myPlugin = (config: z.infer<typeof MyPluginConfig>) => {
  return ctx => {
    // Plugin implementation with validated config
  }
}
```

## Advanced Usage

### Configuration Loading

```typescript
import { loadConfig, loadConfigFromString, createDefaultConfig } from '@hatago/config'

// Load from file
const config = await loadConfig('./hatago.config.json')

// Load from string
const jsonString = '{"name": "test", "version": "1.0.0"}'
const config = await loadConfigFromString(jsonString)

// Create default configuration
const defaultConfig = createDefaultConfig({
  name: 'my-server',
  runtime: 'node',
})
```

### Environment Variable Integration

```typescript
import { loadConfig, resolveEnvironmentVariables } from '@hatago/config'

// Load configuration and resolve environment variables
const config = await loadConfig()
const resolvedEnv = resolveEnvironmentVariables(config, process.env)

console.log(resolvedEnv.LOG_LEVEL) // Resolved from env vars
```

### Configuration Validation

```typescript
import { validateConfig, ConfigValidationError } from '@hatago/config'

try {
  const config = await loadConfig()
  await validateConfig(config)
  console.log('Configuration is valid')
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Validation failed:', error.errors)
  }
}
```

### Configuration Templates

```typescript
import { generateTemplate, generateNodeTemplate, generateWorkersTemplate } from '@hatago/config'

// Generate basic template
const template = generateTemplate({
  name: 'my-server',
  runtime: 'node',
  includeExamples: true,
})

// Generate Node.js specific template
const nodeTemplate = generateNodeTemplate({
  includeStdio: true,
  includeHttp: true,
})

// Generate Workers specific template
const workersTemplate = generateWorkersTemplate({
  includeKV: true,
  includeDurableObjects: false,
})
```

## Configuration Doctor

### Health Checks

```typescript
import { ConfigDoctor } from '@hatago/config'

const doctor = new ConfigDoctor()

// Run all checks
const results = await doctor.diagnose('./hatago.config.json')

// Check specific aspects
const pluginResults = await doctor.checkPlugins(config)
const envResults = await doctor.checkEnvironment(config)
const schemaResults = await doctor.checkSchema(config)

// Print report
doctor.printReport(results)
```

### CLI Integration

```bash
# Using the config doctor via CLI
npx @hatago/cli config doctor

# Check specific aspects
npx @hatago/cli config doctor --plugins
npx @hatago/cli config doctor --environment
npx @hatago/cli config doctor --schema
```

## Runtime Configuration

### Hot Reload (Development)

```typescript
import { createConfigWatcher } from '@hatago/config'

// Watch for configuration changes
const watcher = createConfigWatcher('./hatago.config.json', {
  onUpdate: newConfig => {
    console.log('Configuration updated:', newConfig)
    // Restart server, update plugins, etc.
  },
  onError: error => {
    console.error('Configuration error:', error)
  },
})

// Stop watching
watcher.close()
```

### Dynamic Updates

```typescript
import { ConfigManager } from '@hatago/config'

const configManager = new ConfigManager('./hatago.config.json')

// Load initial configuration
await configManager.load()

// Update configuration at runtime
await configManager.update({
  server: {
    port: 9000,
  },
})

// Save changes to file
await configManager.save()

// Get current configuration
const currentConfig = configManager.getConfig()
```

## Environment Variables

### Configuration via Environment

```bash
# Override configuration with environment variables
HATAGO_NAME="env-server"
HATAGO_SERVER_PORT=9000
HATAGO_TRANSPORT="stdio"
HATAGO_PLUGINS_0="./custom-plugin.js"
```

### Environment Variable Mapping

```typescript
import { mapEnvironmentVariables } from '@hatago/config'

// Map environment variables to configuration
const envMapping = {
  HATAGO_NAME: 'name',
  HATAGO_SERVER_PORT: 'server.port',
  HATAGO_LOG_LEVEL: 'env.LOG_LEVEL',
}

const config = mapEnvironmentVariables(process.env, envMapping)
```

## Plugin Configuration

### Plugin with Configuration

```json
{
  "plugins": [
    {
      "name": "@hatago/plugin-rate-limit",
      "config": {
        "windowMs": 900000,
        "max": 100,
        "message": "Too many requests"
      }
    },
    {
      "name": "./plugins/weather.js",
      "config": {
        "apiKey": "${WEATHER_API_KEY}",
        "timeout": 5000
      }
    }
  ]
}
```

### Accessing Plugin Configuration

```typescript
import type { HatagoPlugin } from '@hatago/core'

interface WeatherPluginConfig {
  apiKey: string
  timeout: number
}

export const weatherPlugin = (config: WeatherPluginConfig): HatagoPlugin => {
  return ctx => {
    // Use configuration
    const apiKey = config.apiKey
    const timeout = config.timeout

    // Register tools with configuration
    ctx.server.registerTool(
      'weather',
      {
        title: 'Weather',
        description: `Get weather (timeout: ${timeout}ms)`,
      },
      async args => {
        // Implementation using config
      }
    )
  }
}
```

## Best Practices

### Configuration Organization

```json
{
  "name": "my-server",
  "version": "1.0.0",

  // Group related settings
  "server": {
    "host": "localhost",
    "port": 8787,
    "timeout": 30000
  },

  // Environment-specific overrides
  "environments": {
    "production": {
      "server": {
        "host": "0.0.0.0"
      }
    }
  },

  // Plugin configuration
  "plugins": [
    {
      "name": "@hatago/plugin-auth",
      "enabled": true,
      "config": {
        "providers": ["github"]
      }
    }
  ]
}
```

### Security Considerations

```json
{
  // Use environment variables for secrets
  "auth": {
    "clientId": "${OAUTH_CLIENT_ID}",
    "clientSecret": "${OAUTH_CLIENT_SECRET}"
  },

  // Mark sensitive configuration
  "sensitive": ["auth.clientSecret", "database.password"]
}
```

### Validation Best Practices

```typescript
// Create custom validation schemas
const ServerConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  ssl: z.boolean().default(false),
})

// Validate subsections
const validateServerConfig = (config: unknown) => {
  return ServerConfigSchema.parse(config)
}
```

## API Reference

### Core Functions

#### `loadConfig(path?, options?)`

Load configuration from file.

```typescript
interface LoadConfigOptions {
  environment?: string
  validate?: boolean
  resolveEnv?: boolean
}
```

#### `validateConfig(config)`

Validate configuration against schema.

#### `createDefaultConfig(overrides?)`

Create default configuration with optional overrides.

### Configuration Schema

```typescript
interface HatagoConfig {
  name: string
  version: string
  runtime?: 'node' | 'workers' | 'deno' | 'bun'
  transport?: ('http' | 'stdio')[]
  plugins?: (string | PluginConfig)[]
  server?: ServerConfig
  env?: Record<string, string>
  environments?: Record<string, Partial<HatagoConfig>>
}
```

### Plugin Configuration

```typescript
interface PluginConfig {
  name: string
  enabled?: boolean
  config?: Record<string, unknown>
}
```

## Examples

### Node.js Server Configuration

```json
{
  "name": "node-mcp-server",
  "version": "1.0.0",
  "runtime": "node",
  "transport": ["http", "stdio"],
  "server": {
    "host": "localhost",
    "port": 8787
  },
  "plugins": ["@hatago/plugin-health", "@hatago/plugin-metrics", "./plugins/custom.js"],
  "environments": {
    "production": {
      "server": {
        "host": "0.0.0.0"
      },
      "env": {
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### Cloudflare Workers Configuration

```json
{
  "name": "workers-mcp-server",
  "version": "1.0.0",
  "runtime": "workers",
  "transport": ["http"],
  "plugins": [
    {
      "name": "@hatago/plugin-kv",
      "config": {
        "namespace": "MCP_CACHE"
      }
    }
  ],
  "workers": {
    "compatibility_date": "2024-01-01",
    "kv_namespaces": [
      {
        "binding": "MCP_CACHE",
        "id": "your-kv-namespace-id"
      }
    ]
  }
}
```

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/cli](../cli) - Command line interface
