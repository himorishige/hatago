/**
 * Hatago Configuration Example (JavaScript format)
 * Copy to .hatagorc.js, hatago.config.js, or other supported locations
 */

// Dynamic configuration with environment variables
const isDevelopment = process.env.NODE_ENV !== 'production'
const port = Number.parseInt(process.env.PORT || '8787', 10)

module.exports = {
  // MCP Proxy Configuration
  proxy: {
    servers: [
      {
        id: 'filesystem',
        name: 'Filesystem MCP Server',
        url: process.env.FILESYSTEM_MCP_URL || 'http://localhost:3001/mcp',
        enabled: true,
        priority: 1,
      },
      {
        id: 'github',
        name: 'GitHub MCP Server',
        url: process.env.GITHUB_MCP_URL || 'http://localhost:3002/mcp',
        enabled: true,
        priority: 2,
      },
    ],
    namespaceStrategy: 'prefix',
    conflictResolution: 'rename',
    namespace: {
      separator: '_',
      caseSensitive: false,
      maxLength: 64,
      autoPrefix: {
        enabled: true,
        format: '{server}_{index}',
      },
    },
  },

  // Server Configuration
  server: {
    port,
    hostname: process.env.HOSTNAME || 'localhost',
    cors: true,
    timeout: 30000,
  },

  // Logging Configuration
  logging: {
    level: isDevelopment ? 'debug' : 'info',
    format: isDevelopment ? 'pretty' : 'json',
    output: 'console',
  },

  // Security Configuration
  security: {
    requireAuth: !isDevelopment,
    allowedOrigins: isDevelopment ? ['*'] : ['https://app.example.com', 'https://api.example.com'],
    rateLimit: {
      enabled: !isDevelopment,
      windowMs: 60000,
      maxRequests: 100,
    },
  },

  // Runner Configuration (for subprocess MCP servers)
  runner: {
    servers: [
      {
        id: 'sqlite',
        name: 'SQLite MCP Server',
        package: '@modelcontextprotocol/server-sqlite',
        packageManager: 'npx',
        args: ['--db', process.env.SQLITE_DB_PATH || './data/database.db'],
        transport: { type: 'stdio' },
        autoStart: true,
        restartOnFailure: true,
        maxRestarts: 3,
        permissions: {
          network: false,
          fsRead: true,
          fsWrite: true,
          env: false,
          spawn: false,
          allowedPaths: ['./data'],
        },
        limits: {
          memory: 256, // MB
          timeout: 30, // seconds
        },
      },
      // Conditionally include servers based on environment
      ...(process.env.ENABLE_PUPPETEER === 'true'
        ? [
            {
              id: 'puppeteer',
              name: 'Puppeteer MCP Server',
              package: '@modelcontextprotocol/server-puppeteer',
              packageManager: 'npx',
              transport: {
                type: 'http',
                port: 3456,
              },
              autoStart: false,
              restartOnFailure: true,
              maxRestarts: 3,
              permissions: {
                network: true,
                fsRead: true,
                fsWrite: false,
                env: true,
                spawn: true,
              },
            },
          ]
        : []),
    ],
    defaults: {
      packageManager: 'npx',
      limits: {
        memory: 512,
        timeout: 60,
      },
      permissions: {
        network: false,
        fsRead: false,
        fsWrite: false,
        env: false,
        spawn: false,
      },
    },
    registry: process.env.NPM_REGISTRY || 'https://registry.npmjs.org',
    cacheDir: process.env.HATAGO_CACHE_DIR || '~/.hatago/cache',
  },
}
