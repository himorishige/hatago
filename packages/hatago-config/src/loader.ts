import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { cosmiconfig } from 'cosmiconfig'
import { config as loadDotenv } from 'dotenv'
import { parse as parseJsonc } from 'jsonc-parser'
import type { ZodError } from 'zod'
import { type HatagoConfig, HatagoConfigSchema } from './schema.js'

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public zodError: ZodError
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * Configuration loader options
 */
export interface LoadConfigOptions {
  /** Search directory (defaults to cwd) */
  searchFrom?: string
  /** Environment prefix for variables (defaults to HATAGO_) */
  envPrefix?: string
  /** Load .env files (defaults to true) */
  loadEnv?: boolean
  /** Validate configuration (defaults to true) */
  validate?: boolean
}

/**
 * Configuration search result
 */
export interface ConfigSearchResult {
  config: HatagoConfig
  filepath: string | null
  isEmpty: boolean
}

/**
 * Load environment variables from .env files
 */
function loadEnvironment(searchDir: string): void {
  const envFiles = ['.env.local', '.env.development', '.env']

  for (const envFile of envFiles) {
    const envPath = join(searchDir, envFile)
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath })
    }
  }
}

/**
 * Expand environment variables in a string
 * Supports ${VAR_NAME} and ${VAR_NAME:default_value} syntax
 */
function expandEnvironmentVariables(str: string): string {
  return str.replace(/\\$\\{([^}]+)\\}/g, (match, varExp) => {
    const [varName, defaultValue] = varExp.split(':').map((s: string) => s.trim())
    const envValue = process.env[varName]

    if (envValue !== undefined) {
      return envValue
    }

    if (defaultValue !== undefined) {
      return defaultValue
    }

    // Variable not found and no default - keep original
    console.warn(`Environment variable ${varName} not found, keeping placeholder: ${match}`)
    return match
  })
}

/**
 * Recursively expand environment variables in configuration object
 */
function expandConfigVariables(obj: any): any {
  if (typeof obj === 'string') {
    return expandEnvironmentVariables(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(expandConfigVariables)
  }

  if (obj && typeof obj === 'object') {
    const expanded: any = {}
    for (const [key, value] of Object.entries(obj)) {
      expanded[key] = expandConfigVariables(value)
    }
    return expanded
  }

  return obj
}

/**
 * Parse JSONC (JSON with comments) content
 */
function parseJsoncContent(content: string, filepath: string): any {
  try {
    const parseErrors: any[] = []
    const result = parseJsonc(content, parseErrors, {
      allowTrailingComma: true,
      disallowComments: false,
    })

    if (parseErrors.length > 0) {
      throw new Error(
        `JSONC parse errors in ${filepath}: ${parseErrors.map(e => e.error).join(', ')}`
      )
    }

    return result
  } catch (error) {
    throw new Error(`Failed to parse JSONC in ${filepath}: ${error}`)
  }
}

/**
 * Custom file loader for cosmiconfig that supports JSONC
 */
function jsoncLoader(filepath: string, content: string): any {
  if (filepath.endsWith('.json') || filepath.endsWith('.jsonc')) {
    return parseJsoncContent(content, filepath)
  }

  // Default JSON parsing for other files
  return JSON.parse(content)
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): HatagoConfig {
  return {
    server: {
      port: 8787,
      hostname: 'localhost',
      cors: true,
      timeout: 30000,
    },
    proxy: {
      servers: [],
      namespaceStrategy: 'prefix',
      conflictResolution: 'error',
      namespace: {
        separator: ':',
        caseSensitive: false,
        maxLength: 64,
      },
      connectionPool: {
        maxConnections: 10,
        idleTimeout: 30000,
        keepAlive: true,
      },
    },
    logging: {
      level: 'info',
      format: 'pretty',
      output: 'console',
    },
    security: {
      requireAuth: false,
      allowedOrigins: ['*'],
      rateLimit: {
        enabled: false,
        windowMs: 60000,
        maxRequests: 100,
      },
    },
  }
}

/**
 * Deep merge two configuration objects
 */
function mergeConfigs(base: any, override: any): any {
  if (!override || typeof override !== 'object') {
    return base
  }

  if (!base || typeof base !== 'object') {
    return override
  }

  const result = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfigs(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Load and parse Hatago configuration
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<ConfigSearchResult> {
  const {
    searchFrom = process.cwd(),
    envPrefix = 'HATAGO_',
    loadEnv = true,
    validate = true,
  } = options

  // Load environment variables first
  if (loadEnv) {
    loadEnvironment(searchFrom)
  }

  // Setup cosmiconfig with JSONC support
  const explorer = cosmiconfig('hatago', {
    searchPlaces: [
      'hatago.config.json',
      'hatago.config.jsonc',
      'hatago.config.js',
      'hatago.config.ts',
      '.hatagorc',
      '.hatagorc.json',
      '.hatagorc.jsonc',
      'package.json',
    ],
    loaders: {
      '.json': jsoncLoader,
      '.jsonc': jsoncLoader,
      '.hatagorc': jsoncLoader,
    },
  })

  try {
    // Search for configuration file
    const searchResult = await explorer.search(searchFrom)

    let userConfig: any = {}
    let filepath: string | null = null

    if (searchResult) {
      userConfig = searchResult.config || {}
      filepath = searchResult.filepath
      console.log(`Loaded configuration from: ${filepath}`)
    } else {
      console.log('No configuration file found, using defaults')
    }

    // Expand environment variables
    const expandedConfig = expandConfigVariables(userConfig)

    // Merge with defaults
    const defaultConfig = getDefaultConfig()
    const mergedConfig = mergeConfigs(defaultConfig, expandedConfig)

    // Validate configuration if requested
    if (validate) {
      try {
        const validatedConfig = HatagoConfigSchema.parse(mergedConfig)
        return {
          config: validatedConfig,
          filepath,
          isEmpty: !searchResult,
        }
      } catch (error) {
        if (error instanceof Error && 'issues' in error) {
          throw new ConfigValidationError(
            `Configuration validation failed${filepath ? ` in ${filepath}` : ''}`,
            error as ZodError
          )
        }
        throw error
      }
    }

    return {
      config: mergedConfig,
      filepath,
      isEmpty: !searchResult,
    }
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error
    }

    throw new Error(`Failed to load configuration: ${error}`)
  }
}

/**
 * Validate configuration against schema
 */
export function validateConfig(config: unknown): HatagoConfig {
  try {
    return HatagoConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      throw new ConfigValidationError('Configuration validation failed', error as ZodError)
    }
    throw error
  }
}

/**
 * Generate configuration file content with comments
 */
export function generateConfigTemplate(): string {
  return `{
  // JSON Schema reference for IDE support
  "$schema": "https://hatago.dev/schema/config.json",
  
  // Proxy configuration for external MCP servers
  "proxy": {
    "servers": [
      {
        "id": "example-server",
        "endpoint": "http://localhost:8080",
        "namespace": "example",
        "description": "Example MCP server",
        "tools": {
          "rename": {
            // "original.name": "newName"
          },
          "include": ["*"],
          "exclude": [
            // "debug.*"
          ]
        },
        "timeout": 30000,
        "healthCheck": {
          "enabled": true,
          "interval": 30000,
          "timeout": 5000
        }
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "error",
    "namespace": {
      "separator": ":",
      "caseSensitive": false,
      "maxLength": 64
    }
  },
  
  // Server configuration
  "server": {
    "port": 8787,
    "hostname": "localhost",
    "cors": true,
    "timeout": 30000
  },
  
  // Logging configuration
  "logging": {
    "level": "info",
    "format": "pretty",
    "output": "console"
  },
  
  // Security configuration
  "security": {
    "requireAuth": false,
    "allowedOrigins": ["*"]
  }
}`
}
