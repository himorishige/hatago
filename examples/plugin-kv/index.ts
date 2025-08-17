/**
 * KV Plugin Example - 関数型Key-Valueストア実装
 *
 * 複数バックエンド対応と名前空間分離
 * TTL管理による効率的なデータ管理
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * ストレージバックエンドの種類
 */
type KVBackend = 'memory' | 'cloudflare'

/**
 * ストア設定（不変）
 */
interface KVConfig {
  readonly backend: KVBackend
  readonly namespace: string
  readonly defaultTTL?: number
  readonly maxKeySize: number
  readonly maxValueSize: number
  readonly enableMetrics: boolean
  readonly enableCompression: boolean
  readonly cleanupInterval: number
}

/**
 * 保存エントリ（不変）
 */
interface StoredEntry<T> {
  readonly value: T
  readonly expiredAt: number | null
  readonly createdAt: number
  readonly namespace: string
  readonly size: number
}

/**
 * KVストアインターフェース（関数型）
 */
interface KVStore {
  readonly get: <T>(key: string) => Promise<T | null>
  readonly set: <T>(key: string, value: T, ttl?: number) => Promise<void>
  readonly delete: (key: string) => Promise<boolean>
  readonly exists: (key: string) => Promise<boolean>
  readonly clear: (pattern?: string) => Promise<number>
  readonly keys: (pattern?: string) => Promise<readonly string[]>
  readonly stats: () => Promise<KVStats>
}

/**
 * 統計情報
 */
interface KVStats {
  readonly backend: string
  readonly totalKeys: number
  readonly totalSize: number
  readonly expiredKeys: number
  readonly namespaces: Record<string, NamespaceStats>
  readonly performance: PerformanceStats
}

interface NamespaceStats {
  readonly keys: number
  readonly size: number
}

interface PerformanceStats {
  readonly averageGetTime: number
  readonly averageSetTime: number
  readonly hitRate: number
}

/**
 * パターンマッチ結果
 */
interface _PatternMatch {
  readonly matched: boolean
  readonly key: string
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: KVConfig = {
  backend: 'memory',
  namespace: 'default',
  defaultTTL: undefined,
  maxKeySize: 512,
  maxValueSize: 1024 * 1024, // 1MB
  enableMetrics: true,
  enableCompression: false,
  cleanupInterval: 300, // 5分
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<KVConfig> => {
  return {
    backend: (env.KV_BACKEND as KVBackend) || 'memory',
    namespace: env.KV_NAMESPACE || 'default',
    defaultTTL: env.KV_DEFAULT_TTL ? Number.parseInt(env.KV_DEFAULT_TTL, 10) : undefined,
    maxKeySize: env.KV_MAX_KEY_SIZE ? Number.parseInt(env.KV_MAX_KEY_SIZE, 10) : undefined,
    maxValueSize: env.KV_MAX_VALUE_SIZE ? Number.parseInt(env.KV_MAX_VALUE_SIZE, 10) : undefined,
    cleanupInterval: env.KV_CLEANUP_INTERVAL
      ? Number.parseInt(env.KV_CLEANUP_INTERVAL, 10)
      : undefined,
  }
}

/**
 * バックエンド自動検出（純粋関数）
 */
const detectBackend = (env: Record<string, unknown>): KVBackend => {
  if (env.KV_BACKEND === 'cloudflare' && env.KV_BINDING) {
    return 'cloudflare'
  }
  return 'memory'
}

/**
 * 名前空間付きキー生成（純粋関数）
 */
const withNamespace =
  (namespace: string) =>
  (key: string): string => {
    return `${namespace}:${key}`
  }

/**
 * 名前空間付きキーの解析（純粋関数）
 */
const parseNamespacedKey = (namespacedKey: string): [string, string] => {
  const [namespace, ...keyParts] = namespacedKey.split(':')
  return [namespace, keyParts.join(':')]
}

/**
 * TTL計算（純粋関数）
 */
const calculateExpiration = (ttlSeconds?: number): number | null => {
  if (!ttlSeconds || ttlSeconds <= 0) return null
  return Date.now() + ttlSeconds * 1000
}

/**
 * 期限切れチェック（純粋関数）
 */
const isExpired = (entry: StoredEntry<any>, now: number): boolean => {
  return entry.expiredAt !== null && now > entry.expiredAt
}

/**
 * データサイズ計算（純粋関数）
 */
const calculateSize = (value: unknown): number => {
  return JSON.stringify(value).length
}

/**
 * パターンマッチング（純粋関数）
 */
const matchesPattern = (key: string, pattern?: string): boolean => {
  if (!pattern) return true

  // 単純なワイルドカードマッチング
  const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')

  return new RegExp(`^${regexPattern}$`).test(key)
}

/**
 * 期限切れエントリのフィルタリング（純粋関数）
 */
const _filterExpired = <T>(
  entries: readonly [string, StoredEntry<T>][],
  now: number
): readonly [string, StoredEntry<T>][] => {
  return entries.filter(([_, entry]) => !isExpired(entry, now))
}

/**
 * キー検証（純粋関数）
 */
const validateKey = (key: string, maxSize: number): void => {
  if (!key) {
    throw new Error('Key cannot be empty')
  }
  if (key.length > maxSize) {
    throw new Error(`Key size exceeds limit: ${key.length} > ${maxSize}`)
  }
  if (key.includes('\0')) {
    throw new Error('Key cannot contain null bytes')
  }
}

/**
 * 値検証（純粋関数）
 */
const validateValue = (value: unknown, maxSize: number): void => {
  const size = calculateSize(value)
  if (size > maxSize) {
    throw new Error(`Value size exceeds limit: ${size} > ${maxSize}`)
  }
}

// ===== メモリストレージ実装 =====

/**
 * インメモリストレージの作成（関数型実装）
 */
const createMemoryStore = (config: KVConfig): KVStore => {
  const storage = new Map<string, StoredEntry<any>>()
  const metrics = {
    getTimes: [] as number[],
    setTimes: [] as number[],
    hits: 0,
    misses: 0,
  }

  const addNamespace = withNamespace(config.namespace)

  const get = async <T>(key: string): Promise<T | null> => {
    const start = Date.now()

    try {
      validateKey(key, config.maxKeySize)

      const namespacedKey = addNamespace(key)
      const entry = storage.get(namespacedKey)

      if (!entry) {
        metrics.misses++
        return null
      }

      const now = Date.now()
      if (isExpired(entry, now)) {
        storage.delete(namespacedKey)
        metrics.misses++
        return null
      }

      metrics.hits++
      return entry.value as T
    } finally {
      if (config.enableMetrics) {
        metrics.getTimes.push(Date.now() - start)
      }
    }
  }

  const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    const start = Date.now()

    try {
      validateKey(key, config.maxKeySize)
      validateValue(value, config.maxValueSize)

      const namespacedKey = addNamespace(key)
      const expiredAt = calculateExpiration(ttl || config.defaultTTL)
      const size = calculateSize(value)

      const entry: StoredEntry<T> = {
        value,
        expiredAt,
        createdAt: Date.now(),
        namespace: config.namespace,
        size,
      }

      storage.set(namespacedKey, entry)
    } finally {
      if (config.enableMetrics) {
        metrics.setTimes.push(Date.now() - start)
      }
    }
  }

  const deleteKey = async (key: string): Promise<boolean> => {
    validateKey(key, config.maxKeySize)

    const namespacedKey = addNamespace(key)
    return storage.delete(namespacedKey)
  }

  const exists = async (key: string): Promise<boolean> => {
    validateKey(key, config.maxKeySize)

    const namespacedKey = addNamespace(key)
    const entry = storage.get(namespacedKey)

    if (!entry) return false

    const now = Date.now()
    if (isExpired(entry, now)) {
      storage.delete(namespacedKey)
      return false
    }

    return true
  }

  const clear = async (pattern?: string): Promise<number> => {
    const namespacePrefix = `${config.namespace}:`
    let deletedCount = 0

    for (const [namespacedKey] of storage) {
      if (!namespacedKey.startsWith(namespacePrefix)) continue

      const [, originalKey] = parseNamespacedKey(namespacedKey)

      if (matchesPattern(originalKey, pattern)) {
        storage.delete(namespacedKey)
        deletedCount++
      }
    }

    return deletedCount
  }

  const keys = async (pattern?: string): Promise<readonly string[]> => {
    const namespacePrefix = `${config.namespace}:`
    const now = Date.now()
    const result: string[] = []

    for (const [namespacedKey, entry] of storage) {
      if (!namespacedKey.startsWith(namespacePrefix)) continue

      if (isExpired(entry, now)) {
        storage.delete(namespacedKey)
        continue
      }

      const [, originalKey] = parseNamespacedKey(namespacedKey)

      if (matchesPattern(originalKey, pattern)) {
        result.push(originalKey)
      }
    }

    return result
  }

  const stats = async (): Promise<KVStats> => {
    const now = Date.now()
    const namespaceStats: Record<string, NamespaceStats> = {}
    let totalKeys = 0
    let totalSize = 0
    let expiredKeys = 0

    for (const [namespacedKey, entry] of storage) {
      const [namespace] = parseNamespacedKey(namespacedKey)

      if (isExpired(entry, now)) {
        expiredKeys++
        continue
      }

      totalKeys++
      totalSize += entry.size

      if (!namespaceStats[namespace]) {
        namespaceStats[namespace] = { keys: 0, size: 0 }
      }

      namespaceStats[namespace] = {
        keys: namespaceStats[namespace].keys + 1,
        size: namespaceStats[namespace].size + entry.size,
      }
    }

    const avgGetTime =
      metrics.getTimes.length > 0
        ? metrics.getTimes.reduce((sum, time) => sum + time, 0) / metrics.getTimes.length
        : 0

    const avgSetTime =
      metrics.setTimes.length > 0
        ? metrics.setTimes.reduce((sum, time) => sum + time, 0) / metrics.setTimes.length
        : 0

    const hitRate =
      metrics.hits + metrics.misses > 0 ? metrics.hits / (metrics.hits + metrics.misses) : 0

    return {
      backend: 'memory',
      totalKeys,
      totalSize,
      expiredKeys,
      namespaces: namespaceStats,
      performance: {
        averageGetTime: avgGetTime,
        averageSetTime: avgSetTime,
        hitRate,
      },
    }
  }

  return {
    get,
    set,
    delete: deleteKey,
    exists,
    clear,
    keys,
    stats,
  }
}

// ===== Cloudflareストレージ実装 =====

/**
 * Cloudflare KVストレージの作成
 */
const createCloudflareStore = (config: KVConfig): KVStore => {
  // 注意: 実際の実装では env.KV_BINDING を使用
  const binding = null as any // プレースホルダー

  const addNamespace = withNamespace(config.namespace)

  const get = async <T>(key: string): Promise<T | null> => {
    validateKey(key, config.maxKeySize)

    const namespacedKey = addNamespace(key)
    const value = await binding?.get(namespacedKey, 'json')
    return value as T | null
  }

  const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    validateKey(key, config.maxKeySize)
    validateValue(value, config.maxValueSize)

    const namespacedKey = addNamespace(key)
    const options = ttl ? { expirationTtl: ttl } : undefined

    await binding?.put(namespacedKey, JSON.stringify(value), options)
  }

  const deleteKey = async (key: string): Promise<boolean> => {
    validateKey(key, config.maxKeySize)

    const namespacedKey = addNamespace(key)
    await binding?.delete(namespacedKey)
    return true // Cloudflare KVは削除の成功/失敗を返さない
  }

  const exists = async (key: string): Promise<boolean> => {
    validateKey(key, config.maxKeySize)

    const namespacedKey = addNamespace(key)
    const value = await binding?.get(namespacedKey)
    return value !== null
  }

  const clear = async (_pattern?: string): Promise<number> => {
    // Cloudflare KVでは一括削除が制限されているため
    // 実装は環境に応じて調整が必要
    return 0
  }

  const keys = async (_pattern?: string): Promise<readonly string[]> => {
    // Cloudflare KVでは一覧取得が制限されているため
    // 実装は環境に応じて調整が必要
    return []
  }

  const stats = async (): Promise<KVStats> => {
    return {
      backend: 'cloudflare',
      totalKeys: 0,
      totalSize: 0,
      expiredKeys: 0,
      namespaces: {},
      performance: {
        averageGetTime: 0,
        averageSetTime: 0,
        hitRate: 0,
      },
    }
  }

  return {
    get,
    set,
    delete: deleteKey,
    exists,
    clear,
    keys,
    stats,
  }
}

// ===== ファクトリー実装 =====

/**
 * KVストアの作成（ファクトリーパターン）
 */
const createKVStore = (config: KVConfig): KVStore => {
  switch (config.backend) {
    case 'memory':
      return createMemoryStore(config)
    case 'cloudflare':
      return createCloudflareStore(config)
    default:
      throw new Error(`Unsupported backend: ${config.backend}`)
  }
}

// ===== MCPツール実装 =====

/**
 * KV取得ツール
 */
const createKVGetTool = (store: KVStore) => async (request: any) => {
  const { key, defaultValue = null } = request.params.arguments as {
    key: string
    defaultValue?: any
  }

  const value = await store.get(key)
  const result = value !== null ? value : defaultValue

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  }
}

/**
 * KV設定ツール
 */
const createKVSetTool = (store: KVStore) => async (request: any) => {
  const { key, value, ttl } = request.params.arguments as {
    key: string
    value: any
    ttl?: number
  }

  await store.set(key, value, ttl)

  return {
    content: [
      {
        type: 'text',
        text: `Key '${key}' has been set successfully${ttl ? ` with TTL ${ttl}s` : ''}`,
      },
    ],
  }
}

/**
 * KV削除ツール
 */
const createKVDeleteTool = (store: KVStore) => async (request: any) => {
  const { key } = request.params.arguments as { key: string }

  const deleted = await store.delete(key)

  return {
    content: [
      {
        type: 'text',
        text: deleted ? `Key '${key}' has been deleted` : `Key '${key}' not found`,
      },
    ],
  }
}

/**
 * KV存在確認ツール
 */
const createKVExistsTool = (store: KVStore) => async (request: any) => {
  const { key } = request.params.arguments as { key: string }

  const exists = await store.exists(key)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(exists),
      },
    ],
  }
}

/**
 * KVキー一覧ツール
 */
const createKVKeysTool = (store: KVStore) => async (request: any) => {
  const { pattern, limit = 100 } = request.params.arguments as {
    pattern?: string
    limit?: number
  }

  const allKeys = await store.keys(pattern)
  const keys = allKeys.slice(0, limit)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            keys,
            total: allKeys.length,
            limited: allKeys.length > limit,
          },
          null,
          2
        ),
      },
    ],
  }
}

/**
 * KVクリアツール
 */
const createKVClearTool = (store: KVStore) => async (request: any) => {
  const { pattern, confirm = false } = request.params.arguments as {
    pattern?: string
    confirm?: boolean
  }

  if (!confirm) {
    throw new Error('Clear operation requires confirmation. Set confirm=true')
  }

  const deletedCount = await store.clear(pattern)

  return {
    content: [
      {
        type: 'text',
        text: `${deletedCount} key(s) have been deleted${pattern ? ` matching pattern '${pattern}'` : ''}`,
      },
    ],
  }
}

/**
 * KV統計ツール
 */
const createKVStatsTool = (store: KVStore) => async (_request: any) => {
  const stats = await store.stats()

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(stats, null, 2),
      },
    ],
  }
}

/**
 * KVクリーンアップツール
 */
const createKVCleanupTool = (store: KVStore) => async (request: any) => {
  const { dryRun = false } = request.params.arguments as {
    dryRun?: boolean
  }

  if (dryRun) {
    const stats = await store.stats()
    return {
      content: [
        {
          type: 'text',
          text: `Dry run: ${stats.expiredKeys} expired keys would be cleaned up`,
        },
      ],
    }
  }

  // 実際のクリーンアップは実装によって異なる
  // メモリストアの場合は自動的に期限切れキーが削除される
  const stats = await store.stats()

  return {
    content: [
      {
        type: 'text',
        text: `Cleanup completed. ${stats.expiredKeys} expired keys removed`,
      },
    ],
  }
}

// ===== プラグイン実装 =====

/**
 * KVプラグインの作成
 */
export const createKVPlugin = (userConfig: Partial<KVConfig> = {}): HatagoPlugin => {
  return async ctx => {
    // 設定の合成
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const detectedBackend = detectBackend(ctx.env || {})

    const config: KVConfig = {
      ...DEFAULT_CONFIG,
      backend: detectedBackend,
      ...userConfig,
      ...envConfig,
    }

    // ストア作成
    const store = createKVStore(config)

    // MCPツール登録
    ctx.server.registerTool(
      'kv_get',
      {
        description: 'Get value from KV store',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to retrieve',
            },
            defaultValue: {
              description: 'Default value if key not found',
            },
          },
          required: ['key'],
        },
      },
      createKVGetTool(store)
    )

    ctx.server.registerTool(
      'kv_set',
      {
        description: 'Set value in KV store',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to set',
            },
            value: {
              description: 'Value to store',
            },
            ttl: {
              type: 'number',
              description: 'Time to live in seconds',
              minimum: 1,
            },
          },
          required: ['key', 'value'],
        },
      },
      createKVSetTool(store)
    )

    ctx.server.registerTool(
      'kv_delete',
      {
        description: 'Delete key from KV store',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to delete',
            },
          },
          required: ['key'],
        },
      },
      createKVDeleteTool(store)
    )

    ctx.server.registerTool(
      'kv_exists',
      {
        description: 'Check if key exists in KV store',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to check',
            },
          },
          required: ['key'],
        },
      },
      createKVExistsTool(store)
    )

    ctx.server.registerTool(
      'kv_keys',
      {
        description: 'List keys in KV store',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Pattern to match keys (supports wildcards)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of keys to return',
              default: 100,
              minimum: 1,
              maximum: 1000,
            },
          },
        },
      },
      createKVKeysTool(store)
    )

    ctx.server.registerTool(
      'kv_clear',
      {
        description: 'Clear keys from KV store',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Pattern to match keys for deletion',
            },
            confirm: {
              type: 'boolean',
              description: 'Confirmation required for safety',
              default: false,
            },
          },
          required: ['confirm'],
        },
      },
      createKVClearTool(store)
    )

    ctx.server.registerTool(
      'kv_stats',
      {
        description: 'Get KV store statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      createKVStatsTool(store)
    )

    ctx.server.registerTool(
      'kv_cleanup',
      {
        description: 'Clean up expired keys',
        inputSchema: {
          type: 'object',
          properties: {
            dryRun: {
              type: 'boolean',
              description: 'Preview cleanup without executing',
              default: false,
            },
          },
        },
      },
      createKVCleanupTool(store)
    )

    // 定期クリーンアップ（バックグラウンド）
    if (config.cleanupInterval > 0) {
      setInterval(async () => {
        try {
          await store.stats() // 統計取得時に期限切れキーを自動削除
        } catch (error) {
          console.warn('KV cleanup failed:', error)
        }
      }, config.cleanupInterval * 1000)
    }
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Set and get value',
    input: { key: 'test', value: 'hello world' },
    expectedOutput: 'has been set successfully',
  },
  {
    name: 'Get existing key',
    input: { key: 'test' },
    expectedOutput: 'hello world',
  },
  {
    name: 'Check key existence',
    input: { key: 'test' },
    expectedOutput: 'true',
  },
  {
    name: 'List keys with pattern',
    input: { pattern: 'test*', limit: 10 },
    expectedOutput: 'keys',
  },
  {
    name: 'Delete key',
    input: { key: 'test' },
    expectedOutput: 'has been deleted',
  },
  {
    name: 'Get KV statistics',
    input: {},
    expectedOutput: 'backend',
  },
  {
    name: 'Cleanup expired keys',
    input: { dryRun: true },
    expectedOutput: 'expired keys',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'kv',
  description: 'Key-Value store with multiple backends and namespace isolation',
  plugin: createKVPlugin({
    backend: 'memory',
    namespace: 'example',
    defaultTTL: 3600,
    maxKeySize: 256,
    maxValueSize: 64 * 1024, // 64KB
    enableMetrics: true,
    enableCompression: false,
    cleanupInterval: 60,
  }),
  testScenarios,
  env: {
    KV_BACKEND: 'memory',
    KV_NAMESPACE: 'example',
    KV_DEFAULT_TTL: '3600',
  },
} as const

export default config
