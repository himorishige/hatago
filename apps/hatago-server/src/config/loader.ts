/**
 * Configuration loader for Hatago
 * Supports multiple formats: JSON, JSONC, YAML, TOML, JS/TS
 */

import { cosmiconfig } from 'cosmiconfig'
import { TypeScriptLoader } from 'cosmiconfig-typescript-loader'
import { logger } from '../utils/logger.js'
import type { HatagoConfig } from './types.js'

/**
 * Default configuration
 */
const defaultConfig: HatagoConfig = {
  proxy: {
    servers: [],
    namespaceStrategy: 'prefix',
    conflictResolution: 'error',
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
  server: {
    port: 8787,
    hostname: 'localhost',
    cors: true,
    timeout: 30000,
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

/**
 * Create cosmiconfig explorer
 */
const createExplorer = () => {
  return cosmiconfig('hatago', {
    searchPlaces: [
      'package.json',
      '.hatagorc',
      '.hatagorc.json',
      '.hatagorc.jsonc',
      '.hatagorc.yaml',
      '.hatagorc.yml',
      '.hatagorc.toml',
      '.hatagorc.js',
      '.hatagorc.cjs',
      '.hatagorc.mjs',
      '.hatagorc.ts',
      'hatago.config.json',
      'hatago.config.jsonc',
      'hatago.config.yaml',
      'hatago.config.yml',
      'hatago.config.toml',
      'hatago.config.js',
      'hatago.config.cjs',
      'hatago.config.mjs',
      'hatago.config.ts',
    ],
    loaders: {
      '.ts': TypeScriptLoader(),
      '.jsonc': (_filepath: string, content: string) => {
        // Simple JSONC support (remove comments)
        const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
        return JSON.parse(cleaned)
      },
    },
  })
}

/**
 * Load configuration from file
 * @param configPath - Path to config file (optional)
 * @returns Merged configuration
 */
export async function loadConfig(configPath?: string): Promise<HatagoConfig> {
  const explorer = createExplorer()

  try {
    let result

    if (configPath) {
      // Load from specific path
      logger.debug(`Loading configuration from: ${configPath}`)
      result = await explorer.load(configPath)
    } else {
      // Search for config file
      logger.debug('Searching for configuration file...')
      result = await explorer.search()
    }

    if (result?.config) {
      logger.info('Configuration loaded successfully', {
        filepath: result.filepath,
        format: result.filepath.split('.').pop(),
      })

      // Validate configuration
      const validated = validateConfig(result.config)
      return mergeConfig(defaultConfig, validated)
    }

    // No config file found, use defaults
    logger.info('No configuration file found, using defaults')
    return defaultConfig
  } catch (error) {
    logger.error('Failed to load configuration', { error: (error as Error).message })

    if (configPath) {
      // If specific path was requested but failed, throw error
      throw new Error(`Failed to load config from ${configPath}: ${(error as Error).message}`)
    }

    // Fall back to defaults
    logger.warn('Falling back to default configuration')
    return defaultConfig
  }
}

/**
 * Validate configuration
 */
function validateConfig(config: unknown): Partial<HatagoConfig> {
  // Basic validation - ensure it's an object
  if (typeof config !== 'object' || config === null) {
    throw new Error('Configuration must be an object')
  }

  // TODO: Add schema validation with Zod
  return config as Partial<HatagoConfig>
}

/**
 * Clear configuration cache (for testing)
 */
export function clearConfigCache(): void {
  const explorer = createExplorer()
  explorer.clearCaches()
}

/**
 * Deep merge two configuration objects
 */
function mergeConfig(base: HatagoConfig, override: Partial<HatagoConfig>): HatagoConfig {
  const result = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key as keyof HatagoConfig] = {
        ...result[key as keyof HatagoConfig],
        ...value,
      } as any
    } else {
      result[key as keyof HatagoConfig] = value as any
    }
  }

  return result
}
