import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { HatagoConfig } from './types.js'

/**
 * Configuration loader for Hatago
 * Supports JSON files with environment variable expansion
 */
export class ConfigLoader {
  private static instance: ConfigLoader
  private config: HatagoConfig | null = null
  private configPath: string | null = null

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader()
    }
    return ConfigLoader.instance
  }

  /**
   * Load configuration from file
   * @param configPath - Path to config file (optional, defaults to hatago.config.json)
   */
  async loadConfig(configPath?: string): Promise<HatagoConfig> {
    // Try different config file locations
    const searchPaths = [
      configPath,
      'hatago.config.json',
      'hatago.config.js',
      '.hatago/config.json',
      process.env.HATAGO_CONFIG,
    ].filter(Boolean) as string[]

    let foundConfigPath: string | null = null
    let rawConfig: string | null = null

    for (const path of searchPaths) {
      const fullPath = resolve(path)
      if (existsSync(fullPath)) {
        foundConfigPath = fullPath
        rawConfig = readFileSync(fullPath, 'utf-8')
        break
      }
    }

    if (!foundConfigPath || !rawConfig) {
      console.log('No config file found, using default configuration')
      return this.getDefaultConfig()
    }

    try {
      // Expand environment variables
      const expandedConfig = this.expandEnvironmentVariables(rawConfig)
      
      // Parse JSON
      const parsedConfig = JSON.parse(expandedConfig) as HatagoConfig
      
      // Validate and merge with defaults
      const config = this.mergeWithDefaults(parsedConfig)
      
      this.config = config
      this.configPath = foundConfigPath
      
      console.log(`Loaded configuration from: ${foundConfigPath}`)
      return config
    } catch (error) {
      throw new Error(`Failed to load config from ${foundConfigPath}: ${error}`)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HatagoConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.')
    }
    return this.config
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | null {
    return this.configPath
  }

  /**
   * Reload configuration
   */
  async reloadConfig(): Promise<HatagoConfig> {
    if (this.configPath) {
      return this.loadConfig(this.configPath)
    }
    return this.loadConfig()
  }

  /**
   * Expand environment variables in config string
   * Supports ${VAR_NAME} and ${VAR_NAME:default_value} syntax
   */
  private expandEnvironmentVariables(configStr: string): string {
    return configStr.replace(/\\$\\{([^}]+)\\}/g, (match, varExp) => {
      const [varName, defaultValue] = varExp.split(':')
      const envValue = process.env[varName.trim()]
      
      if (envValue !== undefined) {
        return envValue
      }
      
      if (defaultValue !== undefined) {
        return defaultValue.trim()
      }
      
      // Variable not found and no default - keep original
      console.warn(`Environment variable ${varName} not found, keeping placeholder`)
      return match
    })
  }

  /**
   * Merge user config with default configuration
   */
  private mergeWithDefaults(userConfig: Partial<HatagoConfig>): HatagoConfig {
    const defaults = this.getDefaultConfig()
    
    return {
      proxy: {
        servers: userConfig.proxy?.servers || [],
        namespaceStrategy: userConfig.proxy?.namespaceStrategy || defaults.proxy!.namespaceStrategy,
        conflictResolution: userConfig.proxy?.conflictResolution || defaults.proxy!.conflictResolution,
        namespace: {
          ...defaults.proxy?.namespace,
          ...userConfig.proxy?.namespace,
        },
        connectionPool: {
          maxConnections: userConfig.proxy?.connectionPool?.maxConnections || defaults.proxy!.connectionPool!.maxConnections,
          idleTimeout: userConfig.proxy?.connectionPool?.idleTimeout || defaults.proxy!.connectionPool!.idleTimeout,
          keepAlive: userConfig.proxy?.connectionPool?.keepAlive ?? defaults.proxy!.connectionPool!.keepAlive,
        },
      },
      server: {
        ...defaults.server,
        ...userConfig.server,
      },
      logging: {
        level: userConfig.logging?.level || defaults.logging!.level,
        format: userConfig.logging?.format || defaults.logging!.format,
        output: userConfig.logging?.output || defaults.logging!.output,
        file: userConfig.logging?.file || defaults.logging?.file,
      },
      security: {
        ...defaults.security,
        ...userConfig.security,
      },
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): HatagoConfig {
    return {
      proxy: {
        servers: [],
        namespaceStrategy: 'prefix',
        conflictResolution: 'error',
        namespace: {
          separator: ':',
          caseSensitive: false,
          maxLength: 64,
          autoPrefix: {
            enabled: false,
            format: '{server}_{index}',
          },
          versioning: {
            enabled: false,
            strategy: 'semver',
            fallback: 'latest',
          },
        },
        connectionPool: {
          maxConnections: 10,
          idleTimeout: 30000,
          keepAlive: true,
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
  }

  /**
   * Validate configuration
   */
  validateConfig(config: HatagoConfig): void {
    // Validate server configurations
    if (config.proxy?.servers) {
      for (const server of config.proxy.servers) {
        if (!server.id || !server.endpoint) {
          throw new Error(`Invalid server config: id and endpoint are required`)
        }
        
        try {
          new URL(server.endpoint)
        } catch {
          throw new Error(`Invalid endpoint URL for server ${server.id}: ${server.endpoint}`)
        }
      }
    }

    // Validate namespace configuration
    if (config.proxy?.namespace) {
      const ns = config.proxy.namespace
      if (ns.maxLength && ns.maxLength < 1) {
        throw new Error('maxLength must be greater than 0')
      }
      if (ns.separator && ns.separator.length !== 1) {
        throw new Error('separator must be a single character')
      }
    }

    // Validate server configuration
    if (config.server) {
      if (config.server.port && (config.server.port < 1 || config.server.port > 65535)) {
        throw new Error('port must be between 1 and 65535')
      }
    }
  }
}

/**
 * Convenience function to load configuration
 */
export async function loadConfig(configPath?: string): Promise<HatagoConfig> {
  const loader = ConfigLoader.getInstance()
  const config = await loader.loadConfig(configPath)
  loader.validateConfig(config)
  return config
}

/**
 * Get current configuration
 */
export function getConfig(): HatagoConfig {
  return ConfigLoader.getInstance().getConfig()
}