# Configuration System Guide

Hatago uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) to provide flexible configuration loading with support for multiple file formats and locations.

## Supported Formats

Hatago can load configuration from:

- **JSON** - `.json` files
- **JSONC** - `.jsonc` files with comments
- **YAML** - `.yaml` or `.yml` files
- **TOML** - `.toml` files
- **JavaScript** - `.js`, `.cjs`, or `.mjs` files
- **TypeScript** - `.ts` files (requires TypeScript in project)
- **package.json** - `hatago` field

## Configuration Search

Hatago searches for configuration in the following order:

1. `package.json` (in `hatago` field)
2. `.hatagorc` (no extension, JSON format)
3. `.hatagorc.json`
4. `.hatagorc.jsonc`
5. `.hatagorc.yaml` or `.hatagorc.yml`
6. `.hatagorc.toml`
7. `.hatagorc.js`, `.hatagorc.cjs`, or `.hatagorc.mjs`
8. `.hatagorc.ts`
9. `hatago.config.json`
10. `hatago.config.jsonc`
11. `hatago.config.yaml` or `hatago.config.yml`
12. `hatago.config.toml`
13. `hatago.config.js`, `hatago.config.cjs`, or `hatago.config.mjs`
14. `hatago.config.ts`

The search starts from the current working directory and traverses up the directory tree until a configuration file is found.

## Configuration Schema

### Complete Configuration Structure

```typescript
interface HatagoConfig {
  // MCP Proxy configuration
  proxy?: {
    servers: ProxyServer[]
    namespaceStrategy: 'prefix' | 'suffix' | 'replace' | 'none'
    conflictResolution: 'error' | 'rename' | 'skip' | 'override'
    namespace: {
      separator: string
      caseSensitive: boolean
      maxLength: number
      autoPrefix: {
        enabled: boolean
        format: string
      }
    }
  }

  // Server configuration
  server?: {
    port: number
    hostname: string
    cors: boolean
    timeout: number
  }

  // Logging configuration
  logging?: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
    format: 'json' | 'pretty'
    output: 'console' | 'file'
  }

  // Security configuration
  security?: {
    requireAuth: boolean
    allowedOrigins: string[]
    rateLimit: {
      enabled: boolean
      windowMs: number
      maxRequests: number
    }
  }

  // Runner configuration
  runner?: {
    servers: ServerManifest[]
    defaults?: {
      packageManager: string
      limits?: ResourceLimits
      permissions?: Permissions
    }
    registry?: string
    cacheDir?: string
  }
}
```

## Format Examples

### JSON Configuration

```json
{
  "server": {
    "port": 8787,
    "hostname": "localhost"
  },
  "logging": {
    "level": "info",
    "format": "pretty"
  },
  "proxy": {
    "servers": [
      {
        "id": "example",
        "url": "http://localhost:3001/mcp",
        "enabled": true
      }
    ]
  }
}
```

### JSONC Configuration (with comments)

```jsonc
{
  // Server configuration
  "server": {
    "port": 8787,
    "hostname": "localhost",
    "cors": true, // Enable CORS for browser clients
    "timeout": 30000,
  },

  /* Security settings */
  "security": {
    "requireAuth": false, // Set to true in production
    "allowedOrigins": ["*"],
  },
}
```

### YAML Configuration

```yaml
server:
  port: 8787
  hostname: localhost
  cors: true
  timeout: 30000

logging:
  level: info
  format: pretty
  output: console

proxy:
  namespaceStrategy: prefix
  conflictResolution: rename
  servers:
    - id: filesystem
      name: Filesystem Server
      url: http://localhost:3001/mcp
      enabled: true
      priority: 1

runner:
  servers:
    - id: sqlite
      package: '@modelcontextprotocol/server-sqlite'
      packageManager: npx
      autoStart: true
      args:
        - --db
        - ./data/app.db
```

### TOML Configuration

```toml
[server]
port = 8787
hostname = "localhost"
cors = true
timeout = 30000

[logging]
level = "info"
format = "pretty"
output = "console"

[security]
requireAuth = false
allowedOrigins = ["*"]

[security.rateLimit]
enabled = false
windowMs = 60000
maxRequests = 100

[[proxy.servers]]
id = "example"
name = "Example Server"
url = "http://localhost:3001/mcp"
enabled = true
```

### JavaScript Configuration

```javascript
// .hatagorc.js or hatago.config.js
module.exports = {
  server: {
    port: process.env.PORT || 8787,
    hostname: process.env.HOSTNAME || 'localhost',
    cors: true,
    timeout: 30000,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  },

  security: {
    requireAuth: process.env.NODE_ENV === 'production',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  },

  // Dynamic server configuration
  runner: {
    servers: [
      {
        id: 'db',
        package:
          process.env.DB_TYPE === 'postgres'
            ? '@modelcontextprotocol/server-postgres'
            : '@modelcontextprotocol/server-sqlite',
        env: {
          DATABASE_URL: process.env.DATABASE_URL,
        },
        autoStart: true,
      },
    ],
  },
}
```

### TypeScript Configuration

```typescript
// hatago.config.ts
import type { HatagoConfig } from '@hatago/core'

const isDevelopment = process.env.NODE_ENV !== 'production'

const config: HatagoConfig = {
  server: {
    port: parseInt(process.env.PORT || '8787', 10),
    hostname: 'localhost',
    cors: true,
    timeout: 30000,
  },

  logging: {
    level: isDevelopment ? 'debug' : 'info',
    format: isDevelopment ? 'pretty' : 'json',
    output: 'console',
  },

  security: {
    requireAuth: !isDevelopment,
    allowedOrigins: isDevelopment ? ['*'] : ['https://app.example.com'],
    rateLimit: {
      enabled: !isDevelopment,
      windowMs: 60000,
      maxRequests: 100,
    },
  },
}

export default config
```

### Package.json Configuration

```json
{
  "name": "my-hatago-app",
  "version": "1.0.0",
  "hatago": {
    "server": {
      "port": 8787
    },
    "logging": {
      "level": "info"
    }
  }
}
```

## Configuration Sections

### Server Configuration

Controls the HTTP server:

```yaml
server:
  port: 8787 # Server port
  hostname: localhost # Bind hostname
  cors: true # Enable CORS headers
  timeout: 30000 # Request timeout in ms
```

### Logging Configuration

Controls logging behavior:

```yaml
logging:
  level: info # trace, debug, info, warn, error, fatal
  format: pretty # json or pretty
  output: console # console or file
```

### Security Configuration

Security settings:

```yaml
security:
  requireAuth: false # Require authentication
  allowedOrigins: # CORS allowed origins
    - https://app.example.com
    - https://api.example.com
  rateLimit:
    enabled: true # Enable rate limiting
    windowMs: 60000 # Time window in ms
    maxRequests: 100 # Max requests per window
```

### Proxy Configuration

MCP proxy server settings:

```yaml
proxy:
  namespaceStrategy: prefix # How to handle naming conflicts
  conflictResolution: rename # What to do on conflicts
  namespace:
    separator: '_' # Namespace separator
    caseSensitive: false # Case sensitivity
    maxLength: 64 # Max name length
  servers:
    - id: server1
      name: Server One
      url: http://localhost:3001/mcp
      enabled: true
      priority: 1
```

### Runner Configuration

Subprocess MCP server management:

```yaml
runner:
  registry: https://registry.npmjs.org # NPM registry
  cacheDir: ~/.hatago/cache # Package cache
  defaults: # Default settings
    packageManager: npx
    limits:
      memory: 512
      timeout: 60
  servers:
    - id: sqlite
      package: '@modelcontextprotocol/server-sqlite'
      autoStart: true
```

## Environment Variables

Configuration values can reference environment variables:

### In JavaScript/TypeScript

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 8787,
  },
  security: {
    requireAuth: process.env.REQUIRE_AUTH === 'true',
  },
}
```

### In YAML (using custom loader)

Some YAML loaders support environment variable expansion:

```yaml
server:
  port: ${PORT:-8787}
  hostname: ${HOSTNAME:-localhost}
```

## Configuration Loading

### Default Behavior

Hatago automatically searches for and loads configuration on startup:

```typescript
// Automatic loading
import { loadConfig } from '@hatago/core'

const config = await loadConfig()
```

### Explicit Path

Load configuration from a specific file:

```typescript
const config = await loadConfig('/path/to/config.yaml')
```

### Programmatic Configuration

Override configuration programmatically:

```typescript
import { createApp } from '@hatago/core'

const app = await createApp({
  config: {
    server: { port: 9000 },
    logging: { level: 'debug' },
  },
})
```

## Configuration Merging

Configuration is merged in the following order (later overrides earlier):

1. Default configuration (built-in)
2. Configuration file (if found)
3. Environment variables (if applicable)
4. Programmatic overrides (if provided)

Deep merging is used for nested objects:

```javascript
// Default
{
  server: {
    port: 8787,
    hostname: 'localhost',
    cors: true
  }
}

// User config
{
  server: {
    port: 9000  // Only override port
  }
}

// Result
{
  server: {
    port: 9000,        // User override
    hostname: 'localhost',  // Default retained
    cors: true         // Default retained
  }
}
```

## Best Practices

### 1. Use Environment-Specific Files

Create different configs for different environments:

```
.hatagorc.yaml           # Default/development
.hatagorc.production.yaml # Production
.hatagorc.test.yaml      # Testing
```

### 2. Keep Secrets Out

Never commit sensitive data:

```javascript
// Good
module.exports = {
  runner: {
    servers: [
      {
        env: {
          API_KEY: process.env.API_KEY, // Read from environment
        },
      },
    ],
  },
}

// Bad
module.exports = {
  runner: {
    servers: [
      {
        env: {
          API_KEY: 'sk-abc123...', // Never do this!
        },
      },
    ],
  },
}
```

### 3. Use TypeScript for Type Safety

```typescript
import type { HatagoConfig } from '@hatago/core'

const config: HatagoConfig = {
  // TypeScript will validate your config
  server: {
    port: 8787,
    // TypeScript error if invalid option
    invalidOption: true, // Error!
  },
}
```

### 4. Document Your Configuration

Use comments in JSONC/YAML/JS:

```yaml
# Production configuration
server:
  port: 443 # HTTPS port
  hostname: api.example.com # Production domain

security:
  requireAuth: true # Always require auth in production
  allowedOrigins:
    # Only allow our frontend domains
    - https://app.example.com
    - https://www.example.com
```

### 5. Validate Configuration

Add validation in JavaScript configs:

```javascript
const port = parseInt(process.env.PORT || '8787', 10)

if (isNaN(port) || port < 1 || port > 65535) {
  throw new Error('Invalid port configuration')
}

module.exports = {
  server: { port },
}
```

## Migration Guide

### From JSON to YAML

```bash
# Install yaml converter
npm install -g js-yaml

# Convert
js-yaml hatago.config.json > .hatagorc.yaml
```

### From Static to Dynamic

Convert static JSON:

```json
{
  "server": {
    "port": 8787
  }
}
```

To dynamic JavaScript:

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 8787,
  },
}
```

## Troubleshooting

### Configuration Not Loading

1. Check file name and location
2. Verify file syntax (JSON/YAML/TOML)
3. Check for syntax errors in JS/TS files
4. Enable debug logging: `LOG_LEVEL=debug`

### Invalid Configuration

1. Check against schema
2. Verify data types
3. Look for typos in property names
4. Review error messages

### Environment Variables Not Working

1. Ensure variables are exported
2. Check variable names
3. Verify JS/TS config is reading them
4. Use `console.log` to debug

## Related Documentation

- [Runner Plugin Guide](./runner-plugin.md) - Subprocess server management
- [Getting Started](../getting-started.md) - Quick setup guide
- [API Reference](../api-reference.md) - Complete API documentation
