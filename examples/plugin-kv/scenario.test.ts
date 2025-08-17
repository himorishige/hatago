/**
 * KV Plugin - 動作検証テスト
 *
 * バックエンド切り替えとTTL機能の検証
 * 名前空間分離とパフォーマンステスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockContext, runTestScenario, withFakeTimers } from '../_shared/test-utils.js'
import type { TestScenario } from '../_shared/types.js'
import { createKVPlugin } from './index.js'

describe('KV Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Plugin Registration', () => {
    it('should register KV tools correctly', async () => {
      // Given: KVプラグイン
      const ctx = createMockContext()
      const plugin = createKVPlugin()

      // When: プラグインを適用
      await plugin(ctx)

      // Then: 8つのツールが登録される
      expect(ctx.server.registerTool).toHaveBeenCalledTimes(8)

      const toolNames = vi.mocked(ctx.server.registerTool).mock.calls.map(call => call[0])
      expect(toolNames).toEqual([
        'kv_get',
        'kv_set',
        'kv_delete',
        'kv_exists',
        'kv_keys',
        'kv_clear',
        'kv_stats',
        'kv_cleanup',
      ])
    })

    it('should auto-detect backend from environment', async () => {
      // Given: Cloudflare環境変数
      const ctx = createMockContext()
      ctx.env = {
        KV_BACKEND: 'cloudflare',
        KV_BINDING: {}, // モックバインディング
      }

      const plugin = createKVPlugin()

      // When: プラグインを適用
      await plugin(ctx)

      // Then: ツールが正常に登録される
      expect(ctx.server.registerTool).toHaveBeenCalled()
    })
  })

  describe('Memory Backend CRUD Operations', () => {
    let getTool: any
    let setTool: any
    let deleteTool: any
    let existsTool: any
    let keysTool: any
    let statsTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createKVPlugin({
        backend: 'memory',
        namespace: 'test',
        enableMetrics: true,
      })
      await plugin(ctx)

      // ツールハンドラーを取得
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      getTool = toolCalls.find(([name]) => name === 'kv_get')![2]
      setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
      deleteTool = toolCalls.find(([name]) => name === 'kv_delete')![2]
      existsTool = toolCalls.find(([name]) => name === 'kv_exists')![2]
      keysTool = toolCalls.find(([name]) => name === 'kv_keys')![2]
      statsTool = toolCalls.find(([name]) => name === 'kv_stats')![2]
    })

    it('should handle basic set and get operations', async () => {
      // Given: 基本的なデータ
      const testData = { name: 'Alice', age: 30 }

      // When: データを設定
      const setResponse = await setTool({
        params: { arguments: { key: 'user:1', value: testData } },
      })

      // Then: 設定が成功
      expect(setResponse.content[0].text).toContain('has been set successfully')

      // When: データを取得
      const getResponse = await getTool({
        params: { arguments: { key: 'user:1' } },
      })

      // Then: 正しいデータが返される
      const retrievedData = JSON.parse(getResponse.content[0].text)
      expect(retrievedData).toEqual(testData)
    })

    it('should handle non-existent keys with default values', async () => {
      // Given: 存在しないキー
      const defaultValue = { default: true }

      // When: デフォルト値付きで取得
      const response = await getTool({
        params: {
          arguments: {
            key: 'nonexistent',
            defaultValue,
          },
        },
      })

      // Then: デフォルト値が返される
      const result = JSON.parse(response.content[0].text)
      expect(result).toEqual(defaultValue)
    })

    it('should check key existence correctly', async () => {
      // Given: データを設定
      await setTool({
        params: { arguments: { key: 'exists-test', value: 'data' } },
      })

      // When: 存在チェック
      const existsResponse = await existsTool({
        params: { arguments: { key: 'exists-test' } },
      })

      const notExistsResponse = await existsTool({
        params: { arguments: { key: 'not-exists' } },
      })

      // Then: 正しい存在状態が返される
      expect(JSON.parse(existsResponse.content[0].text)).toBe(true)
      expect(JSON.parse(notExistsResponse.content[0].text)).toBe(false)
    })

    it('should delete keys correctly', async () => {
      // Given: データを設定
      await setTool({
        params: { arguments: { key: 'delete-test', value: 'data' } },
      })

      // When: キーを削除
      const deleteResponse = await deleteTool({
        params: { arguments: { key: 'delete-test' } },
      })

      // Then: 削除が成功
      expect(deleteResponse.content[0].text).toContain('has been deleted')

      // 削除後は取得できない
      const getResponse = await getTool({
        params: { arguments: { key: 'delete-test' } },
      })
      expect(JSON.parse(getResponse.content[0].text)).toBeNull()
    })

    it('should list keys with pattern matching', async () => {
      // Given: 複数のキーを設定
      await setTool({
        params: { arguments: { key: 'user:1', value: 'data1' } },
      })
      await setTool({
        params: { arguments: { key: 'user:2', value: 'data2' } },
      })
      await setTool({
        params: { arguments: { key: 'admin:1', value: 'data3' } },
      })

      // When: パターンでキーを取得
      const userKeysResponse = await keysTool({
        params: { arguments: { pattern: 'user:*' } },
      })

      const allKeysResponse = await keysTool({
        params: { arguments: {} },
      })

      // Then: パターンに一致するキーが返される
      const userKeys = JSON.parse(userKeysResponse.content[0].text)
      expect(userKeys.keys).toHaveLength(2)
      expect(userKeys.keys).toContain('user:1')
      expect(userKeys.keys).toContain('user:2')

      const allKeys = JSON.parse(allKeysResponse.content[0].text)
      expect(allKeys.keys).toHaveLength(3)
    })

    it('should provide statistics', async () => {
      // Given: データを設定
      await setTool({
        params: { arguments: { key: 'stats-test', value: 'data' } },
      })

      // When: 統計を取得
      const statsResponse = await statsTool({
        params: { arguments: {} },
      })

      // Then: 統計情報が返される
      const stats = JSON.parse(statsResponse.content[0].text)
      expect(stats).toHaveProperty('backend', 'memory')
      expect(stats).toHaveProperty('totalKeys')
      expect(stats).toHaveProperty('totalSize')
      expect(stats).toHaveProperty('namespaces')
      expect(stats).toHaveProperty('performance')
      expect(stats.totalKeys).toBeGreaterThan(0)
    })
  })

  describe('TTL (Time To Live) Functionality', () => {
    let getTool: any
    let setTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createKVPlugin({
        backend: 'memory',
        namespace: 'ttl-test',
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      getTool = toolCalls.find(([name]) => name === 'kv_get')![2]
      setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
    })

    it('should handle TTL expiration with fake timers', () => {
      withFakeTimers(async () => {
        // Given: 固定時刻
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

        // When: 短いTTLでデータを設定
        await setTool({
          params: {
            arguments: {
              key: 'temp-data',
              value: 'expires soon',
              ttl: 5, // 5秒
            },
          },
        })

        // すぐに取得（有効）
        let response = await getTool({
          params: { arguments: { key: 'temp-data' } },
        })
        expect(JSON.parse(response.content[0].text)).toBe('expires soon')

        // 時間を進める（TTL超過）
        vi.advanceTimersByTime(6000) // 6秒後

        // Then: 期限切れで取得できない
        response = await getTool({
          params: { arguments: { key: 'temp-data' } },
        })
        expect(JSON.parse(response.content[0].text)).toBeNull()
      })
    })

    it('should handle indefinite storage without TTL', async () => {
      // Given: TTLなしでデータを設定
      await setTool({
        params: {
          arguments: {
            key: 'permanent-data',
            value: 'never expires',
          },
        },
      })

      // When: 時間が経過してもデータが取得できる
      const response = await getTool({
        params: { arguments: { key: 'permanent-data' } },
      })

      // Then: データが保持されている
      expect(JSON.parse(response.content[0].text)).toBe('never expires')
    })
  })

  describe('Namespace Isolation', () => {
    it('should isolate data between namespaces', async () => {
      // Given: 異なる名前空間のプラグイン
      const ctx1 = createMockContext()
      const ctx2 = createMockContext()

      const plugin1 = createKVPlugin({ namespace: 'ns1' })
      const plugin2 = createKVPlugin({ namespace: 'ns2' })

      await plugin1(ctx1)
      await plugin2(ctx2)

      // ツールを取得
      const setTool1 = vi
        .mocked(ctx1.server.registerTool)
        .mock.calls.find(([name]) => name === 'kv_set')![2]
      const getTool1 = vi
        .mocked(ctx1.server.registerTool)
        .mock.calls.find(([name]) => name === 'kv_get')![2]

      const setTool2 = vi
        .mocked(ctx2.server.registerTool)
        .mock.calls.find(([name]) => name === 'kv_set')![2]
      const getTool2 = vi
        .mocked(ctx2.server.registerTool)
        .mock.calls.find(([name]) => name === 'kv_get')![2]

      // When: 同じキーに異なる値を設定
      await setTool1({
        params: { arguments: { key: 'shared-key', value: 'ns1-value' } },
      })
      await setTool2({
        params: { arguments: { key: 'shared-key', value: 'ns2-value' } },
      })

      // Then: 各名前空間で異なる値が取得される
      const response1 = await getTool1({
        params: { arguments: { key: 'shared-key' } },
      })
      const response2 = await getTool2({
        params: { arguments: { key: 'shared-key' } },
      })

      expect(JSON.parse(response1.content[0].text)).toBe('ns1-value')
      expect(JSON.parse(response2.content[0].text)).toBe('ns2-value')
    })
  })

  describe('Data Validation', () => {
    let setTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createKVPlugin({
        maxKeySize: 10,
        maxValueSize: 100,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
    })

    it('should validate key size limits', async () => {
      // Given: 長すぎるキー
      const longKey = 'a'.repeat(20) // 制限は10文字

      // When/Then: エラーが発生
      await expect(
        setTool({
          params: { arguments: { key: longKey, value: 'data' } },
        })
      ).rejects.toThrow('Key size exceeds limit')
    })

    it('should validate value size limits', async () => {
      // Given: 大きすぎる値
      const largeValue = 'x'.repeat(200) // 制限は100バイト

      // When/Then: エラーが発生
      await expect(
        setTool({
          params: { arguments: { key: 'test', value: largeValue } },
        })
      ).rejects.toThrow('Value size exceeds limit')
    })

    it('should reject empty keys', async () => {
      // Given: 空のキー
      // When/Then: エラーが発生
      await expect(
        setTool({
          params: { arguments: { key: '', value: 'data' } },
        })
      ).rejects.toThrow('Key cannot be empty')
    })
  })

  describe('Clear and Cleanup Operations', () => {
    let setTool: any
    let clearTool: any
    let cleanupTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createKVPlugin({ namespace: 'clear-test' })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
      clearTool = toolCalls.find(([name]) => name === 'kv_clear')![2]
      cleanupTool = toolCalls.find(([name]) => name === 'kv_cleanup')![2]
    })

    it('should clear keys with pattern', async () => {
      // Given: 複数のキーを設定
      await setTool({
        params: { arguments: { key: 'temp:1', value: 'data1' } },
      })
      await setTool({
        params: { arguments: { key: 'temp:2', value: 'data2' } },
      })
      await setTool({
        params: { arguments: { key: 'keep:1', value: 'data3' } },
      })

      // When: パターンでクリア
      const response = await clearTool({
        params: {
          arguments: {
            pattern: 'temp:*',
            confirm: true,
          },
        },
      })

      // Then: 2つのキーが削除される
      expect(response.content[0].text).toContain('2 key(s) have been deleted')
    })

    it('should require confirmation for clear operation', async () => {
      // Given: データを設定
      await setTool({
        params: { arguments: { key: 'test', value: 'data' } },
      })

      // When/Then: 確認なしではエラー
      await expect(
        clearTool({
          params: { arguments: {} },
        })
      ).rejects.toThrow('requires confirmation')
    })

    it('should perform cleanup dry run', async () => {
      // Given: クリーンアップツール
      // When: ドライランを実行
      const response = await cleanupTool({
        params: { arguments: { dryRun: true } },
      })

      // Then: ドライラン結果が返される
      expect(response.content[0].text).toContain('Dry run')
    })
  })

  describe('Performance and Metrics', () => {
    it('should track performance metrics when enabled', async () => {
      // Given: メトリクス有効なプラグイン
      const ctx = createMockContext()
      const plugin = createKVPlugin({
        enableMetrics: true,
        namespace: 'metrics-test',
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
      const getTool = toolCalls.find(([name]) => name === 'kv_get')![2]
      const statsTool = toolCalls.find(([name]) => name === 'kv_stats')![2]

      // When: 複数回操作を実行
      for (let i = 0; i < 5; i++) {
        await setTool({
          params: { arguments: { key: `perf:${i}`, value: `data${i}` } },
        })
        await getTool({
          params: { arguments: { key: `perf:${i}` } },
        })
      }

      // Then: パフォーマンス統計が記録される
      const statsResponse = await statsTool({
        params: { arguments: {} },
      })
      const stats = JSON.parse(statsResponse.content[0].text)

      expect(stats.performance.averageGetTime).toBeGreaterThanOrEqual(0)
      expect(stats.performance.averageSetTime).toBeGreaterThanOrEqual(0)
      expect(stats.performance.hitRate).toBeGreaterThan(0)
    })
  })

  describe('Test Scenarios', () => {
    const scenarios: readonly TestScenario[] = [
      {
        name: 'Set value',
        input: { key: 'test', value: 'hello' },
        expectedOutput: 'has been set successfully',
      },
      {
        name: 'Get value',
        input: { key: 'test' },
        expectedOutput: 'hello',
      },
      {
        name: 'Check existence',
        input: { key: 'test' },
        expectedOutput: 'true',
      },
      {
        name: 'Get statistics',
        input: {},
        expectedOutput: 'backend',
      },
    ] as const

    it.each(scenarios)('should handle scenario: $name', async scenario => {
      // Given: KVプラグイン
      const ctx = createMockContext()
      const plugin = createKVPlugin()
      await plugin(ctx)

      // 対応するツールを特定
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      let toolHandler: any

      if ('value' in scenario.input) {
        // set tool
        toolHandler = toolCalls.find(([name]) => name === 'kv_set')![2]
      } else if ('key' in scenario.input) {
        if (scenario.name.includes('Get')) {
          // get tool
          toolHandler = toolCalls.find(([name]) => name === 'kv_get')![2]
        } else {
          // exists tool
          toolHandler = toolCalls.find(([name]) => name === 'kv_exists')![2]
        }
      } else {
        // stats tool
        toolHandler = toolCalls.find(([name]) => name === 'kv_stats')![2]
      }

      // When: シナリオを実行
      const result = await runTestScenario(scenario, async input => {
        const response = await toolHandler({
          params: { arguments: input },
        })
        return response.content[0].text
      })

      // Then: 期待される結果
      expect(result.success).toBe(true)
      if (scenario.expectedOutput) {
        expect(result.output).toContain(scenario.expectedOutput)
      }
    })
  })

  describe('Backend Abstraction', () => {
    it('should provide consistent interface across backends', async () => {
      // Given: 各バックエンドでのプラグイン
      const backends = ['memory'] as const // Cloudflareは実際のバインディングが必要

      for (const backend of backends) {
        const ctx = createMockContext()
        const plugin = createKVPlugin({ backend })
        await plugin(ctx)

        const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
        const setTool = toolCalls.find(([name]) => name === 'kv_set')![2]
        const getTool = toolCalls.find(([name]) => name === 'kv_get')![2]

        // When: 基本操作を実行
        await setTool({
          params: { arguments: { key: 'backend-test', value: `${backend}-data` } },
        })

        const response = await getTool({
          params: { arguments: { key: 'backend-test' } },
        })

        // Then: 一貫したインターフェースで動作
        expect(JSON.parse(response.content[0].text)).toBe(`${backend}-data`)

        // ツールが登録されていることを確認
        expect(ctx.server.registerTool).toHaveBeenCalledTimes(8)
      }
    })
  })
})
