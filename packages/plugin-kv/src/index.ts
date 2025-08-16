import type { CapabilityAwarePluginFactory, PluginContext } from '@hatago/core'

export interface KVConfig {
  /** Storage backend */
  backend?: 'memory' | 'redis' | 'cloudflare-kv'
  /** Redis connection string (Node.js only) */
  redisUrl?: string
  /** Cloudflare KV namespace binding (Workers only) */
  kvNamespace?: string
  /** Default TTL in seconds */
  defaultTtl?: number
  /** Key prefix */
  prefix?: string
}

export interface KVStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}

/**
 * KV storage abstraction plugin
 * Provides unified KV interface across different runtimes
 */
const kvPlugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  const config: KVConfig = context.config as KVConfig

  return async ({ server, capabilities }) => {
    const { kv, logger } = capabilities

    // Create KV store based on runtime and config
    const store = createKVStore(context, config, kv)

    // Register KV tools
    server.registerTool(
      'kv.get',
      {
        title: 'Get Value',
        description: 'Get value from key-value store by key',
        inputSchema: {},
      },
      async (args: any) => {
        const { key } = args
        if (!key || typeof key !== 'string') {
          throw new Error('Key is required and must be a string')
        }

        logger.info('KV get operation', { key })
        const value = await store.get(key)

        return {
          content: [
            {
              type: 'text',
              text: value !== null ? `Value: ${value}` : 'Key not found',
            },
          ],
        }
      }
    )

    server.registerTool(
      'kv.set',
      {
        title: 'Set Value',
        description: 'Set value in key-value store',
        inputSchema: {},
      },
      async (args: any) => {
        const { key, value, ttl } = args
        if (!key || typeof key !== 'string') {
          throw new Error('Key is required and must be a string')
        }
        if (value === undefined) {
          throw new Error('Value is required')
        }

        const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
        logger.info('KV set operation', { key, ttl })
        await store.set(key, stringValue, ttl)

        return {
          content: [
            {
              type: 'text',
              text: `Successfully set key: ${key}`,
            },
          ],
        }
      }
    )

    server.registerTool(
      'kv.delete',
      {
        title: 'Delete Key',
        description: 'Delete key from key-value store',
        inputSchema: {},
      },
      async (args: any) => {
        const { key } = args
        if (!key || typeof key !== 'string') {
          throw new Error('Key is required and must be a string')
        }

        logger.info('KV delete operation', { key })
        await store.delete(key)

        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted key: ${key}`,
            },
          ],
        }
      }
    )

    server.registerTool(
      'kv.list',
      {
        title: 'List Keys',
        description: 'List keys with optional prefix filter',
        inputSchema: {},
      },
      async (args: any) => {
        const { prefix } = args

        logger.info('KV list operation', { prefix })
        const keys = await store.list(prefix)

        return {
          content: [
            {
              type: 'text',
              text:
                keys.length > 0 ? `Found ${keys.length} keys: ${keys.join(', ')}` : 'No keys found',
            },
          ],
        }
      }
    )

    logger.info('KV plugin initialized', {
      backend: detectBackend(context, config),
      prefix: config.prefix,
      defaultTtl: config.defaultTtl,
    })
  }
}

function createKVStore(context: PluginContext, config: KVConfig, baseKv: any): KVStore {
  const backend = detectBackend(context, config)
  const prefix = config.prefix || ''

  const addPrefix = (key: string) => (prefix ? `${prefix}:${key}` : key)
  const removePrefix = (key: string) => (prefix ? key.replace(`${prefix}:`, '') : key)

  switch (backend) {
    case 'memory':
      return createMemoryStore(addPrefix, removePrefix)
    case 'cloudflare-kv':
      return createCloudflareKVStore(addPrefix, removePrefix, baseKv, config)
    case 'redis':
      // For now, fallback to memory store
      // In production, this would use Redis client
      return createMemoryStore(addPrefix, removePrefix)
    default:
      return createMemoryStore(addPrefix, removePrefix)
  }
}

function detectBackend(context: PluginContext, config: KVConfig): string {
  if (config.backend) {
    return config.backend
  }

  // Auto-detect based on runtime
  if (context.runtime === 'workers') {
    return 'cloudflare-kv'
  }
  return config.redisUrl ? 'redis' : 'memory'
}

function createMemoryStore(
  addPrefix: (key: string) => string,
  removePrefix: (key: string) => string
): KVStore {
  const storage = new Map<string, { value: string; expires?: number }>()

  return {
    async get(key: string): Promise<string | null> {
      const prefixedKey = addPrefix(key)
      const item = storage.get(prefixedKey)
      if (!item) return null

      if (item.expires && Date.now() > item.expires) {
        storage.delete(prefixedKey)
        return null
      }

      return item.value
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      const prefixedKey = addPrefix(key)
      const item = ttl ? { value, expires: Date.now() + ttl * 1000 } : { value }
      storage.set(prefixedKey, item)
    },

    async delete(key: string): Promise<void> {
      const prefixedKey = addPrefix(key)
      storage.delete(prefixedKey)
    },

    async list(prefix?: string): Promise<string[]> {
      const searchPrefix = prefix ? addPrefix(prefix) : addPrefix('')
      const keys: string[] = []

      for (const [key, item] of storage.entries()) {
        if (key.startsWith(searchPrefix)) {
          // Check if expired
          if (!item.expires || Date.now() <= item.expires) {
            keys.push(removePrefix(key))
          } else {
            storage.delete(key)
          }
        }
      }

      return keys.sort()
    },
  }
}

function createCloudflareKVStore(
  addPrefix: (key: string) => string,
  removePrefix: (key: string) => string,
  kvBinding: any,
  _config: KVConfig
): KVStore {
  return {
    async get(key: string): Promise<string | null> {
      const prefixedKey = addPrefix(key)
      return await kvBinding.get(prefixedKey)
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      const prefixedKey = addPrefix(key)
      const options = ttl ? { expirationTtl: ttl } : {}
      await kvBinding.put(prefixedKey, value, options)
    },

    async delete(key: string): Promise<void> {
      const prefixedKey = addPrefix(key)
      await kvBinding.delete(prefixedKey)
    },

    async list(prefix?: string): Promise<string[]> {
      const searchPrefix = prefix ? addPrefix(prefix) : addPrefix('')
      const result = await kvBinding.list({ prefix: searchPrefix })
      return result.keys.map((item: any) => removePrefix(item.name))
    },
  }
}

export default kvPlugin
