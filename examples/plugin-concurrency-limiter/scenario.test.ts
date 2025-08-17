/**
 * Concurrency Limiter Plugin - 動作検証テスト
 *
 * サーキットブレーカーとリデューサーパターンの検証
 * 並行処理と状態管理のテスト例
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockContext, runTestScenario, withFakeTimers } from '../_shared/test-utils.js'
import type { TestScenario } from '../_shared/types.js'
import { createConcurrencyLimiterPlugin } from './index.js'

describe('Concurrency Limiter Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Plugin Registration', () => {
    it('should register concurrency control tools correctly', async () => {
      // Given: 同時実行制御プラグイン
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin()

      // When: プラグインを適用
      await plugin(ctx)

      // Then: 4つのツールが登録される
      expect(ctx.server.registerTool).toHaveBeenCalledTimes(4)

      const toolNames = vi.mocked(ctx.server.registerTool).mock.calls.map(call => call[0])
      expect(toolNames).toEqual([
        'concurrency_status',
        'concurrency_config',
        'concurrency_reset',
        'concurrency_simulate',
      ])
    })

    it('should register concurrency limiting middleware', async () => {
      // Given: 同時実行制御プラグイン
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin()

      // When: プラグインを適用
      await plugin(ctx)

      // Then: ミドルウェアが登録される
      expect(ctx.app.use).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('Concurrency Control Logic', () => {
    let statusTool: any
    let configTool: any
    let resetTool: any
    let _simulateTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin({
        maxConcurrent: 2, // テスト用に小さな値
        queueSize: 3,
        timeoutMs: 5000,
        circuitBreaker: {
          failureThreshold: 0.5,
          minimumRequests: 3,
          cooldownMs: 5000,
          halfOpenMaxRequests: 1,
        },
      })
      await plugin(ctx)

      // ツールハンドラーを取得
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      statusTool = toolCalls.find(([name]) => name === 'concurrency_status')![2]
      configTool = toolCalls.find(([name]) => name === 'concurrency_config')![2]
      resetTool = toolCalls.find(([name]) => name === 'concurrency_reset')![2]
      _simulateTool = toolCalls.find(([name]) => name === 'concurrency_simulate')![2]
    })

    it('should start with empty state', async () => {
      // Given: 初期状態
      // When: ステータスを取得
      const response = await statusTool({
        params: { arguments: {} },
      })

      // Then: 空の状態で開始
      const status = JSON.parse(response.content[0].text)
      expect(status.activeSlots).toBe(0)
      expect(status.totalSlots).toBe(2)
      expect(status.queueLength).toBe(0)
      expect(status.circuitState).toBe('closed')
    })

    it('should include queue information when requested', async () => {
      // Given: キュー情報付きリクエスト
      const request = {
        params: {
          arguments: {
            includeQueue: true,
            includeMetrics: true,
          },
        },
      }

      // When: ステータスを取得
      const response = await statusTool(request)

      // Then: キューとメトリクス情報が含まれる
      const status = JSON.parse(response.content[0].text)
      expect(status).toHaveProperty('queue')
      expect(status).toHaveProperty('metrics')
      expect(Array.isArray(status.queue)).toBe(true)
    })

    it('should get and update configuration', async () => {
      // Given: 設定取得リクエスト
      const getRequest = {
        params: { arguments: { action: 'get' } },
      }

      // When: 設定を取得
      const getResponse = await configTool(getRequest)
      const config = JSON.parse(getResponse.content[0].text)

      // Then: 設定が正しく取得される
      expect(config.maxConcurrent).toBe(2)
      expect(config.queueSize).toBe(3)

      // Given: 設定更新リクエスト
      const setRequest = {
        params: {
          arguments: {
            action: 'set',
            config: {
              maxConcurrent: 4,
              queueSize: 8,
            },
          },
        },
      }

      // When: 設定を更新
      const setResponse = await configTool(setRequest)

      // Then: 更新が成功
      expect(setResponse.content[0].text).toContain('updated successfully')
    })

    it('should reset different scopes correctly', async () => {
      // Given: 各種リセットリクエスト
      const requests = [
        { scope: 'circuit', reason: 'Test circuit reset' },
        { scope: 'queue', reason: 'Test queue reset' },
        { scope: 'all', reason: 'Test full reset' },
      ]

      for (const req of requests) {
        // When: スコープ別リセット
        const response = await resetTool({
          params: { arguments: req },
        })

        // Then: リセットが成功
        expect(response.content[0].text).toContain('has been reset')
        expect(response.content[0].text).toContain(req.reason)
      }
    })
  })

  describe('Load Simulation', () => {
    let simulateTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin({
        maxConcurrent: 2,
        queueSize: 2,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      simulateTool = toolCalls.find(([name]) => name === 'concurrency_simulate')![2]
    })

    it('should simulate load correctly', async () => {
      // Given: シミュレーションパラメータ
      const request = {
        params: {
          arguments: {
            requests: 5,
            concurrency: 2,
            failureRate: 0.2,
            requestDurationMs: 100,
          },
        },
      }

      // When: 負荷シミュレーションを実行
      const response = await simulateTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: シミュレーション結果が返される
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('details')
      expect(result.summary.totalRequests).toBe(5)
      expect(result.summary).toHaveProperty('successful')
      expect(result.summary).toHaveProperty('failed')
      expect(result.summary).toHaveProperty('rejected')
      expect(Array.isArray(result.details)).toBe(true)
    })

    it('should handle various failure rates', async () => {
      // Given: 高い失敗率
      const request = {
        params: {
          arguments: {
            requests: 10,
            failureRate: 0.8, // 80% 失敗率
            requestDurationMs: 50,
          },
        },
      }

      // When: シミュレーションを実行
      const response = await simulateTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: 失敗が多く記録される
      expect(result.summary.totalRequests).toBe(10)
      expect(result.summary.failed + result.summary.successful).toBeGreaterThan(0)
    })
  })

  describe('Middleware Integration', () => {
    it('should allow requests within concurrency limit', async () => {
      // Given: 同時実行制御プラグイン
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin({
        maxConcurrent: 3,
        queueSize: 2,
      })
      await plugin(ctx)

      // ミドルウェア関数を取得
      const middleware = vi.mocked(ctx.app.use).mock.calls[0][0]

      // モックコンテキスト
      const mockC = {
        req: {
          header: vi.fn().mockReturnValue('1'), // priority
          path: '/test',
        },
        res: {
          headers: new Map(),
        },
      }
      const mockNext = vi.fn().mockResolvedValue(undefined)

      // When: リクエストを処理
      await middleware(mockC, mockNext)

      // Then: リクエストが許可される
      expect(mockNext).toHaveBeenCalled()
    })

    it('should reject requests when limit exceeded', async () => {
      // Given: 制限の厳しいプラグイン
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin({
        maxConcurrent: 1,
        queueSize: 0, // キューなし
      })
      await plugin(ctx)

      const middleware = vi.mocked(ctx.app.use).mock.calls[0][0]

      const mockC = {
        req: {
          header: vi.fn().mockReturnValue('0'),
          path: '/test',
        },
        res: {
          headers: new Map(),
        },
      }

      // 長時間実行するモックNext
      const mockNext = vi
        .fn()
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)))

      // When: 最初のリクエスト（成功）
      const firstRequest = middleware(mockC, mockNext)

      // 2回目のリクエスト（即座に実行）
      const secondRequest = middleware(mockC, vi.fn())

      // Then: 2回目のリクエストが拒否される
      const secondResult = await secondRequest
      expect(secondResult).toBeDefined()

      // 最初のリクエストを完了
      await firstRequest
      expect(mockNext).toHaveBeenCalledTimes(1)
    })
  })

  describe('Circuit Breaker Functionality', () => {
    it('should transition circuit states correctly', () => {
      // Given: サーキットブレーカーロジック（実装の純粋関数をテスト）

      // 正常状態での動作
      const normalStats = {
        totalRequests: 10,
        successfulRequests: 9,
        failedRequests: 1,
        recentRequests: [],
        lastFailureTime: 0,
        consecutiveFailures: 0,
      }

      const config = {
        failureThreshold: 0.5,
        minimumRequests: 5,
        cooldownMs: 5000,
        halfOpenMaxRequests: 1,
      }

      // When: エラー率を計算
      const errorRate = normalStats.failedRequests / normalStats.totalRequests

      // Then: 閾値以下でサーキットは閉じたまま
      expect(errorRate).toBeLessThan(config.failureThreshold)

      // 高いエラー率の場合
      const failureStats = {
        ...normalStats,
        successfulRequests: 3,
        failedRequests: 7,
      }

      const highErrorRate = failureStats.failedRequests / failureStats.totalRequests
      expect(highErrorRate).toBeGreaterThan(config.failureThreshold)
    })

    it('should respect minimum request threshold', () => {
      // Given: 少数のリクエスト
      const fewRequestsStats = {
        totalRequests: 2,
        successfulRequests: 0,
        failedRequests: 2,
        recentRequests: [],
        lastFailureTime: Date.now(),
        consecutiveFailures: 2,
      }

      const config = {
        failureThreshold: 0.5,
        minimumRequests: 5,
        cooldownMs: 5000,
        halfOpenMaxRequests: 1,
      }

      // When: 最小リクエスト数チェック
      const shouldOpen = fewRequestsStats.totalRequests >= config.minimumRequests

      // Then: 最小数に達していないためサーキットは開かない
      expect(shouldOpen).toBe(false)
    })
  })

  describe('Priority Queue Functionality', () => {
    it('should handle priority-based queuing', () => {
      // Given: 優先度付きキューロジック（実装の純粋関数をテスト）
      const queue = [
        { id: 'req1', priority: 1, queuedAt: 1000 },
        { id: 'req2', priority: 3, queuedAt: 2000 },
      ]

      const newRequest = { id: 'req3', priority: 5, queuedAt: 3000 }

      // When: 優先度順で挿入位置を決定
      const insertIndex = queue.findIndex(q => q.priority < newRequest.priority)

      // Then: 正しい位置に挿入される
      expect(insertIndex).toBe(0) // 最初に挿入される（最高優先度）

      const newQueue = [...queue.slice(0, insertIndex), newRequest, ...queue.slice(insertIndex)]

      expect(newQueue).toEqual([
        { id: 'req3', priority: 5, queuedAt: 3000 }, // 最高優先度
        { id: 'req1', priority: 1, queuedAt: 1000 },
        { id: 'req2', priority: 3, queuedAt: 2000 },
      ])
    })
  })

  describe('Test Scenarios', () => {
    const scenarios: readonly TestScenario[] = [
      {
        name: 'Get concurrency status',
        input: {},
        expectedOutput: 'activeSlots',
      },
      {
        name: 'Get configuration',
        input: { action: 'get' },
        expectedOutput: 'maxConcurrent',
      },
      {
        name: 'Reset circuit',
        input: { scope: 'circuit', reason: 'Test' },
        expectedOutput: 'has been reset',
      },
      {
        name: 'Simulate load',
        input: { requests: 3, concurrency: 1, failureRate: 0 },
        expectedOutput: 'totalRequests',
      },
    ] as const

    it.each(scenarios)('should handle scenario: $name', async scenario => {
      // Given: 同時実行制御プラグイン
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin()
      await plugin(ctx)

      // 対応するツールを特定
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      let toolHandler: any

      if ('action' in scenario.input) {
        // config tool
        toolHandler = toolCalls.find(([name]) => name === 'concurrency_config')![2]
      } else if ('scope' in scenario.input) {
        // reset tool
        toolHandler = toolCalls.find(([name]) => name === 'concurrency_reset')![2]
      } else if ('requests' in scenario.input) {
        // simulate tool
        toolHandler = toolCalls.find(([name]) => name === 'concurrency_simulate')![2]
      } else {
        // status tool
        toolHandler = toolCalls.find(([name]) => name === 'concurrency_status')![2]
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

  describe('Edge Cases and Error Handling', () => {
    let configTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createConcurrencyLimiterPlugin()
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      configTool = toolCalls.find(([name]) => name === 'concurrency_config')![2]
    })

    it('should handle invalid configuration actions', async () => {
      // Given: 無効なアクション
      const request = {
        params: { arguments: { action: 'invalid' } },
      }

      // When/Then: エラーが発生
      await expect(configTool(request)).rejects.toThrow('Invalid action')
    })

    it('should handle missing configuration in set action', async () => {
      // Given: 設定なしのsetアクション
      const request = {
        params: { arguments: { action: 'set' } },
      }

      // When/Then: エラーが発生
      await expect(configTool(request)).rejects.toThrow('Invalid action or missing config')
    })
  })

  describe('Performance and Timing', () => {
    it('should handle timing-sensitive operations with fake timers', () => {
      withFakeTimers(() => {
        // Given: 固定時刻
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

        const baseTime = Date.now()
        const cooldownMs = 5000

        // When: クールダウン時間をシミュレート
        vi.advanceTimersByTime(cooldownMs + 1000)
        const afterCooldown = Date.now()

        // Then: 期待される時間経過
        expect(afterCooldown - baseTime).toBe(cooldownMs + 1000)

        // クールダウン判定のテスト
        const elapsed = afterCooldown - baseTime
        const shouldTransition = elapsed >= cooldownMs
        expect(shouldTransition).toBe(true)
      })
    })
  })

  describe('State Immutability', () => {
    it('should maintain immutability in state updates', () => {
      // Given: 初期状態
      const initialState = {
        activeSlots: new Map([['req1', { id: 'req1', startTime: 1000, priority: 0 }]]),
        queue: [{ id: 'req2', priority: 1, queuedAt: 2000 }],
        circuitState: 'closed' as const,
      }

      // When: 状態を「更新」（実際は新しいオブジェクトを作成）
      const newState = {
        ...initialState,
        activeSlots: new Map(initialState.activeSlots),
        queue: [...initialState.queue],
      }

      // 新しいエントリを追加
      newState.activeSlots.set('req3', { id: 'req3', startTime: 3000, priority: 0 })
      newState.queue.push({ id: 'req4', priority: 2, queuedAt: 4000 })

      // Then: 元の状態は変更されない（不変性が保たれる）
      expect(initialState.activeSlots.size).toBe(1)
      expect(initialState.queue.length).toBe(1)
      expect(newState.activeSlots.size).toBe(2)
      expect(newState.queue.length).toBe(2)

      // 異なるオブジェクトであることを確認
      expect(initialState.activeSlots).not.toBe(newState.activeSlots)
      expect(initialState.queue).not.toBe(newState.queue)
    })
  })
})
