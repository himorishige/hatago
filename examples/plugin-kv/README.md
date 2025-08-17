# KV Plugin Example

複数バックエンド対応のKey-Valueストレージプラグインの関数型実装例。抽象化と名前空間分離を重視。

## 概要

このプラグインは：

- 複数ストレージバックエンド（Memory/Cloudflare KV）対応
- TTL（有効期限）付きデータ管理
- 名前空間による論理分離
- 関数型インターフェースによる抽象化
- 原子的操作とトランザクション的な処理

## 実行方法

```bash
# インメモリストレージ（デフォルト）
pnpm ex --plugin kv --mode smoke

# Cloudflare KV バックエンド（環境変数設定時）
KV_BACKEND=cloudflare pnpm ex --plugin kv --mode full

# TTL機能テスト
KV_DEFAULT_TTL=10 pnpm ex --plugin kv --mode smoke

# 名前空間分離テスト
KV_NAMESPACE=test-ns pnpm ex --plugin kv --mode smoke
```

## 期待される動作

### 基本的なCRUD操作

```
✅ SUCCESS (80ms)
KV Store initialized: Memory backend, namespace 'default'

SET user:123 = {"name": "Alice", "age": 30} (TTL: 3600s)
GET user:123 = {"name": "Alice", "age": 30}
EXISTS user:123 = true
DELETE user:123 = true
GET user:123 = null (expired/deleted)
```

### TTL（有効期限）動作

```
SET temp:data = "temporary" (TTL: 5s)
GET temp:data = "temporary"

5 seconds later...
GET temp:data = null (expired)
CLEANUP: 1 expired key removed
```

### 名前空間分離

```
Namespace 'users': SET profile:1 = {...}
Namespace 'cache': SET profile:1 = {...}

GET users:profile:1 ≠ GET cache:profile:1
CLEAR users: profile:1 remains in cache namespace
```

## アーキテクチャ説明

### ストレージ抽象化

```typescript
// 統一インターフェース（バックエンド非依存）
interface KVStore {
  readonly get: <T>(key: string) => Promise<T | null>
  readonly set: <T>(key: string, value: T, ttl?: number) => Promise<void>
  readonly delete: (key: string) => Promise<boolean>
  readonly exists: (key: string) => Promise<boolean>
  readonly clear: (pattern?: string) => Promise<number>
  readonly keys: (pattern?: string) => Promise<ReadonlyArray<string>>
}

// バックエンド実装の切り替え
const createKVStore = (backend: 'memory' | 'cloudflare'): KVStore => {
  switch (backend) {
    case 'memory':
      return createMemoryStore()
    case 'cloudflare':
      return createCloudflareStore()
  }
}
```

### 関数型データ操作

```typescript
// 不変データ構造
interface StoredEntry<T> {
  readonly value: T
  readonly expiredAt: number | null
  readonly createdAt: number
  readonly namespace: string
}

// 純粋関数による操作
const isExpired = (entry: StoredEntry<any>, now: number): boolean => {
  return entry.expiredAt !== null && now > entry.expiredAt
}

const withNamespace =
  (namespace: string) =>
  (key: string): string => {
    return `${namespace}:${key}`
  }

const parseNamespacedKey = (namespacedKey: string): [string, string] => {
  const [namespace, ...keyParts] = namespacedKey.split(':')
  return [namespace, keyParts.join(':')]
}
```

### TTL管理

```typescript
// TTL計算（純粋関数）
const calculateExpiration = (ttlSeconds?: number): number | null => {
  if (!ttlSeconds || ttlSeconds <= 0) return null
  return Date.now() + ttlSeconds * 1000
}

// 期限切れチェック（純粋関数）
const filterExpired = <T>(
  entries: ReadonlyArray<[string, StoredEntry<T>]>,
  now: number
): ReadonlyArray<[string, StoredEntry<T>]> => {
  return entries.filter(([_, entry]) => !isExpired(entry, now))
}
```

## MCPツール

### `kv_get`

キーからデータを取得

```typescript
{
  "key": "user:profile:123",
  "namespace": "app",           // オプション：名前空間指定
  "defaultValue": null          // オプション：デフォルト値
}
```

### `kv_set`

キーにデータを設定

```typescript
{
  "key": "user:profile:123",
  "value": {
    "id": 123,
    "name": "Alice",
    "email": "alice@example.com"
  },
  "ttl": 3600,                  // オプション：有効期限（秒）
  "namespace": "app"            // オプション：名前空間
}
```

### `kv_delete`

キーを削除

```typescript
{
  "key": "user:profile:123",
  "namespace": "app"            // オプション：名前空間
}
```

### `kv_exists`

キーの存在確認

```typescript
{
  "key": "user:profile:123",
  "namespace": "app"
}
```

### `kv_keys`

キー一覧の取得

```typescript
{
  "pattern": "user:*",          // オプション：パターンマッチ
  "namespace": "app",           // オプション：名前空間
  "limit": 100                  // オプション：取得上限
}
```

### `kv_clear`

キーの一括削除

```typescript
{
  "pattern": "temp:*",          // オプション：パターンマッチ
  "namespace": "cache",         // オプション：名前空間
  "confirm": true               // 必須：安全確認
}
```

### `kv_stats`

ストレージ統計情報

```typescript
{
  "includeNamespaces": true,    // 名前空間別統計
  "includeExpired": true        // 期限切れ情報
}
```

**レスポンス例：**

```json
{
  "backend": "memory",
  "totalKeys": 156,
  "totalSize": 45231,
  "expiredKeys": 12,
  "namespaces": {
    "app": { "keys": 89, "size": 32145 },
    "cache": { "keys": 45, "size": 8934 },
    "session": { "keys": 22, "size": 4152 }
  },
  "performance": {
    "averageGetTime": 0.8,
    "averageSetTime": 1.2,
    "hitRate": 0.87
  }
}
```

### `kv_cleanup`

期限切れキーの削除

```typescript
{
  "namespace": "cache",         // オプション：対象名前空間
  "dryRun": false              // オプション：実行前確認
}
```

## 実装パターン

### バックエンド切り替えパターン

```typescript
// 環境に応じたバックエンド選択
const detectBackend = (env: Record<string, unknown>): KVBackend => {
  if (env.KV_BACKEND === 'cloudflare' && env.KV_BINDING) {
    return 'cloudflare'
  }
  return 'memory'
}

// ファクトリーパターンでの生成
const createKVStore = (backend: KVBackend, config: KVConfig): KVStore => {
  const implementations = {
    memory: () => createMemoryStore(config),
    cloudflare: () => createCloudflareStore(config),
  }

  return implementations[backend]()
}
```

### メモリストレージ実装

```typescript
// インメモリストレージ（関数型実装）
const createMemoryStore = (config: KVConfig): KVStore => {
  const storage = new Map<string, StoredEntry<any>>()

  const get = async <T>(key: string): Promise<T | null> => {
    const namespacedKey = withNamespace(config.namespace)(key)
    const entry = storage.get(namespacedKey)

    if (!entry) return null
    if (isExpired(entry, Date.now())) {
      storage.delete(namespacedKey)
      return null
    }

    return entry.value as T
  }

  const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    const namespacedKey = withNamespace(config.namespace)(key)
    const expiredAt = calculateExpiration(ttl || config.defaultTTL)

    storage.set(namespacedKey, {
      value,
      expiredAt,
      createdAt: Date.now(),
      namespace: config.namespace,
    })
  }

  return { get, set, delete: deleteKey, exists, clear, keys }
}
```

### Cloudflareストレージ実装

```typescript
// Cloudflare KV実装
const createCloudflareStore = (config: KVConfig): KVStore => {
  const binding = config.kvBinding as KVNamespace

  const get = async <T>(key: string): Promise<T | null> => {
    const namespacedKey = withNamespace(config.namespace)(key)
    const value = await binding.get(namespacedKey, 'json')
    return value as T | null
  }

  const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    const namespacedKey = withNamespace(config.namespace)(key)
    const options = ttl ? { expirationTtl: ttl } : undefined

    await binding.put(namespacedKey, JSON.stringify(value), options)
  }

  return { get, set, delete: deleteKey, exists, clear, keys }
}
```

### 原子的操作の実装

```typescript
// Compare-And-Swap操作
const compareAndSwap = async <T>(
  store: KVStore,
  key: string,
  expectedValue: T,
  newValue: T
): Promise<boolean> => {
  const currentValue = await store.get<T>(key)

  if (JSON.stringify(currentValue) !== JSON.stringify(expectedValue)) {
    return false
  }

  await store.set(key, newValue)
  return true
}

// インクリメント操作
const increment = async (store: KVStore, key: string, delta = 1): Promise<number> => {
  const current = (await store.get<number>(key)) || 0
  const newValue = current + delta
  await store.set(key, newValue)
  return newValue
}
```

## テスト戦略

### バックエンド切り替えテスト

```typescript
describe.each(['memory', 'cloudflare'])('KV Store (%s backend)', backend => {
  let store: KVStore

  beforeEach(() => {
    store = createKVStore(backend as KVBackend, testConfig)
  })

  it('should handle basic CRUD operations', async () => {
    await store.set('test', 'value')
    expect(await store.get('test')).toBe('value')
    expect(await store.exists('test')).toBe(true)
    expect(await store.delete('test')).toBe(true)
    expect(await store.get('test')).toBeNull()
  })
})
```

### TTL機能テスト

```typescript
it('should handle TTL expiration', async () => {
  vi.useFakeTimers()

  // 短いTTLで設定
  await store.set('temp', 'value', 1) // 1秒
  expect(await store.get('temp')).toBe('value')

  // 時間を進める
  vi.advanceTimersByTime(1500)
  expect(await store.get('temp')).toBeNull()
})
```

### 名前空間分離テスト

```typescript
it('should isolate namespaces correctly', async () => {
  const store1 = createKVStore('memory', { namespace: 'ns1' })
  const store2 = createKVStore('memory', { namespace: 'ns2' })

  await store1.set('key', 'value1')
  await store2.set('key', 'value2')

  expect(await store1.get('key')).toBe('value1')
  expect(await store2.get('key')).toBe('value2')
})
```

### パフォーマンステスト

```typescript
it('should handle large datasets efficiently', async () => {
  const startTime = Date.now()

  // 大量データの挿入
  const promises = Array.from({ length: 1000 }, (_, i) => store.set(`key${i}`, `value${i}`))
  await Promise.all(promises)

  const duration = Date.now() - startTime
  expect(duration).toBeLessThan(1000) // 1秒以内
})
```

## 設定オプション

### 環境変数

- `KV_BACKEND`: ストレージバックエンド（`memory` | `cloudflare`）
- `KV_NAMESPACE`: デフォルト名前空間（デフォルト: `default`）
- `KV_DEFAULT_TTL`: デフォルトTTL秒数
- `KV_CLEANUP_INTERVAL`: 自動クリーンアップ間隔（秒）
- `KV_MAX_KEY_SIZE`: 最大キーサイズ（バイト）
- `KV_MAX_VALUE_SIZE`: 最大値サイズ（バイト）

### プラグイン設定

```typescript
const kvPlugin = createKVPlugin({
  backend: 'memory',
  namespace: 'app',
  defaultTTL: 3600,
  maxKeySize: 512,
  maxValueSize: 1024 * 1024, // 1MB
  enableMetrics: true,
  enableCompression: true,
  cleanupInterval: 300, // 5分
  namespaces: {
    cache: { defaultTTL: 300 },
    session: { defaultTTL: 1800 },
    persistent: { defaultTTL: null },
  },
})
```

## 学習ポイント

1. **抽象化**: 複数バックエンドを統一インターフェースで管理
2. **名前空間**: 論理的なデータ分離の実装
3. **TTL管理**: 時間ベースのデータ管理
4. **関数型パターン**: 純粋関数によるデータ操作
5. **パフォーマンス**: 効率的なデータアクセスパターン
