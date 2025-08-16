/**
 * Configuration loader for Hatago
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
 * Load configuration from file
 * @param configPath - Path to config file (optional)
 * @returns Merged configuration
 */
export async function loadConfig(configPath?: string): Promise<HatagoConfig> {
  const paths = [
    configPath,
    resolve(process.cwd(), 'hatago.config.json'),
    resolve(process.cwd(), 'hatago.config.jsonc'),
    resolve(process.cwd(), '.hatagorc.json'),
  ].filter(Boolean) as string[]

  for (const path of paths) {
    try {
      logger.debug(`Attempting to load configuration from: ${path}`)
      const content = await readFile(path, 'utf-8')

      // Simple JSONC support (remove comments)
      const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      const userConfig = JSON.parse(cleaned) as Partial<HatagoConfig>

      logger.info('Configuration loaded successfully', { config_path: path })
      return mergeConfig(defaultConfig, userConfig)
    } catch (error) {
      if (configPath === path) {
        // If specific path was requested but failed, throw error
        throw new Error(`Failed to load config from ${path}: ${(error as Error).message}`)
      }
      // Continue trying other paths
      logger.debug(`Config file not found: ${path}`)
    }
  }

  // No config file found, use defaults
  logger.info('No configuration file found, using defaults')
  return defaultConfig
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
