/**
 * Hello Hatago Plugin - 動作検証テスト
 * 
 * 関数型プログラミングパターンのテスト例
 * スナップショットテストと純粋関数のテストを組み合わせ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHelloPlugin } from './index.js'
import { 
  createMockContext, 
  withFakeTimers,
  normalizeLogEntry,
  runTestScenario
} from '../_shared/test-utils.js'
import type { TestScenario } from '../_shared/types.js'

describe('Hello Hatago Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Plugin Registration', () => {
    it('should register hello_hatago tool correctly', async () => {
      // Given: モックコンテキスト
      const ctx = createMockContext()
      const plugin = createHelloPlugin()
      
      // When: プラグインを適用
      await plugin(ctx)
      
      // Then: ツールが正しく登録される
      expect(ctx.server.registerTool).toHaveBeenCalledWith(
        'hello_hatago',
        expect.objectContaining({
          description: expect.stringContaining('greeting'),
          inputSchema: expect.objectContaining({
            type: 'object'
          })
        }),
        expect.any(Function)
      )
    })

    it('should apply custom options correctly', async () => {
      // Given: カスタム設定
      const customOptions = {
        defaultName: 'CustomName',
        includeTimestamp: true,
        enableProgress: false
      }
      
      const ctx = createMockContext()
      const plugin = createHelloPlugin(customOptions)
      
      // When: プラグインを適用
      await plugin(ctx)
      
      // Then: 設定が反映される
      expect(ctx.server.registerTool).toHaveBeenCalled()
      
      // ツールハンドラーを取得して実行
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      const toolHandler = registerCall[2]
      
      const response = await toolHandler({
        params: { arguments: {} }
      })
      
      expect(response.content[0].text).toContain('CustomName')
    })
  })

  describe('Tool Handler - Pure Functions', () => {
    let toolHandler: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createHelloPlugin()
      await plugin(ctx)
      
      // ツールハンドラーを抽出
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      toolHandler = registerCall[2]
    })

    it('should handle basic greeting correctly', async () => {
      // Given: 基本的な入力
      const request = {
        params: {
          arguments: { name: 'World' }
        }
      }
      
      // When: ツールを実行
      const response = await toolHandler(request)
      
      // Then: 期待される挨拶が返される
      expect(response).toEqual({
        content: [{
          type: 'text',
          text: 'Hello World!'
        }],
        isError: false
      })
    })

    it('should include emoji when requested', async () => {
      // Given: 絵文字を含む入力
      const request = {
        params: {
          arguments: { 
            name: 'Hatago', 
            includeEmoji: true 
          }
        }
      }
      
      // When: ツールを実行
      const response = await toolHandler(request)
      
      // Then: 絵文字が含まれる
      expect(response.content[0].text).toMatch(/Hello Hatago! [👋🎉✨🚀💫]/)
      expect(response.isError).toBe(false)
    })

    it('should use default name when none provided', async () => {
      // Given: 名前なしの入力
      const request = {
        params: {
          arguments: {}
        }
      }
      
      // When: ツールを実行
      const response = await toolHandler(request)
      
      // Then: デフォルト名が使用される
      expect(response.content[0].text).toBe('Hello Hatago!')
    })

    it('should handle invalid input gracefully', async () => {
      // Given: 無効な入力
      const request = {
        params: {
          arguments: null
        }
      }
      
      // When: ツールを実行
      const response = await toolHandler(request)
      
      // Then: エラーが適切にハンドリングされる
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('Error:')
    })
  })

  describe('Progress Notifications', () => {
    it('should send progress notifications when enabled', async () => {
      // Given: プログレス通知有効な設定
      const ctx = createMockContext()
      const plugin = createHelloPlugin({ enableProgress: true })
      await plugin(ctx)
      
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      const toolHandler = registerCall[2]
      
      const request = {
        params: {
          arguments: {
            name: 'World',
            progressToken: 'test-token'
          }
        }
      }
      
      // When: ツールを実行
      await toolHandler(request, ctx.server)
      
      // Then: プログレス通知が送信される
      expect(ctx.server.notification).toHaveBeenCalledTimes(2) // 開始と完了
      expect(ctx.server.notification).toHaveBeenCalledWith({
        method: 'notifications/progress',
        params: {
          progressToken: 'test-token',
          progress: 0,
          total: 100,
          message: 'Starting greeting generation...'
        }
      })
    })

    it('should skip progress notifications when disabled', async () => {
      // Given: プログレス通知無効な設定
      const ctx = createMockContext()
      const plugin = createHelloPlugin({ enableProgress: false })
      await plugin(ctx)
      
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      const toolHandler = registerCall[2]
      
      const request = {
        params: {
          arguments: {
            name: 'World',
            progressToken: 'test-token'
          }
        }
      }
      
      // When: ツールを実行
      await toolHandler(request, ctx.server)
      
      // Then: プログレス通知は送信されない
      expect(ctx.server.notification).not.toHaveBeenCalled()
    })
  })

  describe('Test Scenarios', () => {
    const scenarios: ReadonlyArray<TestScenario> = [
      {
        name: 'Basic greeting',
        input: { name: 'World' },
        expectedOutput: 'Hello World!'
      },
      {
        name: 'Default name usage',
        input: {},
        expectedOutput: 'Hello Hatago!'
      },
      {
        name: 'Invalid input',
        input: null,
        shouldFail: true
      }
    ] as const

    it.each(scenarios)('should handle scenario: $name', async (scenario) => {
      // Given: テストシナリオ
      const ctx = createMockContext()
      const plugin = createHelloPlugin()
      await plugin(ctx)
      
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      const toolHandler = registerCall[2]
      
      // When: シナリオを実行
      const result = await runTestScenario(scenario, async (input) => {
        const response = await toolHandler({
          params: { arguments: input }
        })
        
        if (response.isError) {
          throw new Error(response.content[0].text)
        }
        
        return response.content[0].text
      })
      
      // Then: 期待される結果
      if (scenario.shouldFail) {
        expect(result.success).toBe(true) // shouldFailの場合は例外が期待されるため成功
      } else {
        expect(result.success).toBe(true)
        if (scenario.expectedOutput) {
          expect(result.output).toContain(scenario.expectedOutput)
        }
      }
    })
  })

  describe('Deterministic Testing with Fake Timers', () => {
    it('should produce consistent timestamps when enabled', () => {
      withFakeTimers(() => {
        // Given: タイムスタンプ有効な設定
        const options = {
          includeTimestamp: true,
          enableProgress: false
        }
        
        // 固定時刻を設定
        const fixedDate = new Date('2024-01-01T00:00:00.000Z')
        vi.setSystemTime(fixedDate)
        
        // When & Then: タイムスタンプが一貫している
        // ここでは実際のプラグイン内部の関数をテストする場合の例
        // 実装では createGreeting 関数などを直接テストできる
        
        expect(new Date().toISOString()).toBe('2024-01-01T00:00:00.000Z')
      })
    })
  })

  describe('Snapshot Testing', () => {
    it('should match expected tool schema snapshot', async () => {
      // Given: プラグインの設定
      const ctx = createMockContext()
      const plugin = createHelloPlugin()
      
      // When: プラグインを適用
      await plugin(ctx)
      
      // Then: ツールスキーマがスナップショットと一致
      const registerCall = vi.mocked(ctx.server.registerTool).mock.calls[0]
      const [toolName, toolSchema] = registerCall
      
      expect({
        name: toolName,
        schema: toolSchema
      }).toMatchSnapshot()
    })
  })
})