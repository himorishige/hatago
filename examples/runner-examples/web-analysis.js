/**
 * Web Analysis Configuration with Dynamic Settings
 * This example shows how to use JavaScript for environment-based configuration
 */

// Determine search engine based on environment
const searchEngine = process.env.SEARCH_ENGINE || 'brave'
const searchPackages = {
  brave: '@modelcontextprotocol/server-brave-search',
  google: '@modelcontextprotocol/server-google-search',
  bing: '@modelcontextprotocol/server-bing-search',
}

module.exports = {
  // Runner configuration
  runner: {
    servers: [
      // Search engine server
      {
        id: 'search',
        name: `${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)} Search`,
        package: searchPackages[searchEngine],
        packageManager: 'npx',
        env: {
          API_KEY: process.env[`${searchEngine.toUpperCase()}_API_KEY`],
          MAX_RESULTS: process.env.SEARCH_MAX_RESULTS || '10',
        },
        transport: {
          type: 'stdio',
        },
        autoStart: true,
        restartOnFailure: true,
        maxRestarts: 3,
        permissions: {
          network: true, // API calls
          fsRead: false,
          fsWrite: false,
          spawn: false,
          // Restrict to search API endpoints
          allowedHosts: ['api.brave.com', 'www.googleapis.com', 'api.bing.microsoft.com'],
        },
      },

      // Playwright for web scraping
      {
        id: 'playwright',
        name: 'Playwright Browser Automation',
        package: '@modelcontextprotocol/server-playwright',
        packageManager: 'npx',
        transport: {
          type: 'http',
          port: Number.parseInt(process.env.PLAYWRIGHT_PORT || '3456', 10),
          hostname: 'localhost',
        },
        env: {
          BROWSER: process.env.PLAYWRIGHT_BROWSER || 'chromium',
          HEADLESS: process.env.PLAYWRIGHT_HEADLESS || 'true',
          TIMEOUT: process.env.PLAYWRIGHT_TIMEOUT || '30000',
        },
        // Only start if scraping is enabled
        autoStart: process.env.ENABLE_SCRAPING === 'true',
        restartOnFailure: true,
        maxRestarts: 2,
        permissions: {
          network: true, // Web access
          fsRead: true, // Read downloads
          fsWrite: true, // Save screenshots
          spawn: true, // Launch browser
          env: true, // Browser environment
          allowedPaths: ['./downloads', './screenshots', '/tmp'],
        },
        limits: {
          memory: 1024, // Browsers need more memory
          timeout: 120, // Longer timeout for web operations
          cpuTime: 300,
        },
      },

      // Optional: Screenshot storage
      {
        id: 'storage',
        name: 'File Storage',
        package: '@modelcontextprotocol/server-filesystem',
        packageManager: 'npx',
        args: ['--base-path', './storage', '--allow-write'],
        transport: {
          type: 'stdio',
        },
        autoStart: process.env.ENABLE_STORAGE === 'true',
        permissions: {
          fsRead: true,
          fsWrite: true,
          network: false,
          spawn: false,
          allowedPaths: ['./storage', './downloads', './screenshots'],
        },
      },

      // Optional: Data analysis with Python
      ...(process.env.ENABLE_ANALYSIS === 'true'
        ? [
            {
              id: 'python-analysis',
              name: 'Python Data Analysis',
              package: '@modelcontextprotocol/server-jupyter',
              packageManager: 'npx',
              env: {
                JUPYTER_TOKEN: process.env.JUPYTER_TOKEN,
                KERNEL: 'python3',
              },
              transport: {
                type: 'http',
                port: 8888,
              },
              autoStart: false, // Manual start for analysis
              permissions: {
                network: false,
                fsRead: true,
                fsWrite: true,
                spawn: true,
                env: true,
                allowedPaths: ['./notebooks', './data'],
              },
              limits: {
                memory: 2048, // Data analysis needs memory
                timeout: 300, // Long-running analyses
              },
            },
          ]
        : []),
    ],

    // Global defaults
    defaults: {
      packageManager: 'npx',
      restartOnFailure: true,
      maxRestarts: 3,
      limits: {
        memory: 512,
        timeout: 60,
      },
    },

    // Use custom registry if specified
    registry: process.env.NPM_REGISTRY || 'https://registry.npmjs.org',

    // Cache directory
    cacheDir: process.env.HATAGO_CACHE_DIR || '~/.hatago/cache',
  },

  // Main server configuration
  server: {
    port: Number.parseInt(process.env.PORT || '8787', 10),
    hostname: process.env.HOSTNAME || 'localhost',
    cors: true,
    timeout: 120000, // Longer timeout for web operations
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
    output: 'console',
  },

  // Security configuration
  security: {
    requireAuth: process.env.NODE_ENV === 'production',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    rateLimit: {
      enabled: process.env.NODE_ENV === 'production',
      windowMs: 60000,
      maxRequests: 100,
    },
  },
}
