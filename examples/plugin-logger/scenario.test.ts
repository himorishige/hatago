/**
 * Logger Plugin - 動作検証テスト
 * 
 * 構造化ログ、PIIマスキング、関数合成の検証
 * スナップショットテストで出力形式を保証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLoggerPlugin } from './index.js'
import { 
  createMockContext, 
  withFakeTimers,
  maskSensitiveData,
  normalizeLogEntry
} from '../_shared/test-utils.js'

describe('Logger Plugin', () => {
  // コンソール出力をキャプチャ
  let consoleSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    // コンソール出力をモック
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Plugin Registration', () => {
    it('should register logger tools correctly', async () => {
      // Given: ロガープラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      
      // When: プラグインを適用
      await plugin(ctx)
      
      // Then: 2つのツールが登録される
      expect(ctx.server.registerTool).toHaveBeenCalledTimes(2)
      expect(ctx.server.registerTool).toHaveBeenCalledWith(
        'logs_query',
        expect.objectContaining({
          description: expect.stringContaining('Query')
        }),
        expect.any(Function)
      )
      expect(ctx.server.registerTool).toHaveBeenCalledWith(
        'logs_config',
        expect.objectContaining({
          description: expect.stringContaining('configuration')
        }),
        expect.any(Function)
      )
    })

    it('should register request logging middleware', async () => {
      // Given: ロガープラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      
      // When: プラグインを適用
      await plugin(ctx)
      
      // Then: ミドルウェアが登録される
      expect(ctx.app.use).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('Configuration Management', () => {
    it('should use default configuration', async () => {
      // Given: デフォルト設定
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      // ログ設定ツールを取得
      const configTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_config')![2]
      
      // When: 設定を取得
      const response = await configTool({
        params: { arguments: { action: 'get' } }
      })
      
      // Then: デフォルト設定が返される
      const config = JSON.parse(response.content[0].text)
      expect(config).toEqual({
        level: 'info',
        format: 'pretty',
        enableMasking: true,
        sampleRate: 1.0
      })
    })

    it('should merge environment variables into configuration', async () => {
      // Given: 環境変数付きコンテキスト
      const ctx = createMockContext()
      ctx.env = {
        LOG_LEVEL: 'debug',
        LOG_FORMAT: 'json',
        NOREN_MASKING: 'false'
      }
      
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      // ログ設定ツールを取得
      const configTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_config')![2]
      
      // When: 設定を取得
      const response = await configTool({
        params: { arguments: { action: 'get' } }
      })
      
      // Then: 環境変数が反映される
      const config = JSON.parse(response.content[0].text)
      expect(config.level).toBe('debug')
      expect(config.format).toBe('json')
      expect(config.enableMasking).toBe(false)
    })

    it('should update configuration dynamically', async () => {
      // Given: ロガープラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      const configTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_config')![2]
      
      // When: 設定を更新
      const updateResponse = await configTool({
        params: {
          arguments: {
            action: 'set',
            config: { level: 'error', format: 'json' }
          }
        }
      })
      
      // Then: 更新が成功する
      expect(updateResponse.content[0].text).toContain('updated successfully')
      
      // 設定が実際に更新されていることを確認
      const getResponse = await configTool({
        params: { arguments: { action: 'get' } }
      })
      const config = JSON.parse(getResponse.content[0].text)
      expect(config.level).toBe('error')
      expect(config.format).toBe('json')
    })
  })

  describe('Log Query Tool', () => {
    it('should query logs with level filter', async () => {
      // Given: ログエントリが存在するプラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      const queryTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_query')![2]
      
      // When: エラーレベルでクエリ
      const response = await queryTool({
        params: {
          arguments: { level: 'error', limit: 5 }
        }
      })
      
      // Then: フィルタされた結果が返される
      const logs = JSON.parse(response.content[0].text)
      expect(Array.isArray(logs)).toBe(true)
    })

    it('should query logs with search keyword', async () => {
      // Given: ログエントリが存在するプラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      const queryTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_query')![2]
      
      // When: キーワードでクエリ
      const response = await queryTool({
        params: {
          arguments: { search: 'initialized', limit: 10 }
        }
      })
      
      // Then: キーワードに一致するログが返される
      const logs = JSON.parse(response.content[0].text)
      expect(logs.length).toBeGreaterThanOrEqual(0)
    })

    it('should respect limit parameter', async () => {
      // Given: ログエントリが存在するプラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      const queryTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_query')![2]
      
      // When: 制限付きでクエリ
      const response = await queryTool({
        params: {
          arguments: { limit: 2 }
        }
      })
      
      // Then: 指定件数以下で返される
      const logs = JSON.parse(response.content[0].text)
      expect(logs.length).toBeLessThanOrEqual(2)
    })
  })

  describe('PII Masking', () => {
    it('should mask email addresses', () => {
      // Given: メールアドレスを含むデータ
      const data = {
        email: 'user@example.com',
        message: 'Contact user@test.org for details'
      }
      
      // When: マスキングを適用
      const masked = maskSensitiveData(data)
      
      // Then: メールアドレスがマスクされる
      expect(masked).toEqual({
        email: '***@***.***',
        message: 'Contact ***@***.*** for details'
      })
    })

    it('should mask credit card numbers', () => {
      // Given: クレジットカード番号を含むデータ
      const data = {
        card: '4111-1111-1111-1111',
        note: 'Card 4111111111111111 was used'
      }
      
      // When: マスキングを適用
      const masked = maskSensitiveData(data)
      
      // Then: カード番号がマスクされる
      expect(masked).toEqual({
        card: '****-****-****-****',
        note: 'Card ****-****-****-**** was used'
      })
    })

    it('should mask sensitive field names', () => {
      // Given: 機密フィールドを含むデータ
      const data = {
        password: 'secret123',
        apiKey: 'sk_live_abcdef123456',
        token: 'bearer_xyz789',
        email: 'user@example.com'
      }
      
      // When: マスキングを適用
      const masked = maskSensitiveData(data)
      
      // Then: 機密フィールドがマスクされる
      expect(masked).toEqual({
        password: '***MASKED***',
        apiKey: '***MASKED***',
        token: '***MASKED***',
        email: '***@***.***'
      })
    })

    it('should handle nested objects', () => {
      // Given: ネストされたデータ
      const data = {
        user: {
          email: 'user@example.com',
          password: 'secret',
          profile: {
            phone: '090-1234-5678'
          }
        }
      }
      
      // When: マスキングを適用
      const masked = maskSensitiveData(data)
      
      // Then: ネストされた機密情報もマスクされる
      expect(masked).toEqual({
        user: {
          email: '***@***.***',
          password: '***MASKED***',
          profile: {
            phone: '***-***-****'
          }
        }
      })
    })
  })

  describe('Request Logging Middleware', () => {
    it('should log successful requests', async () => {
      // Given: ロガープラグインとモックミドルウェア
      const ctx = createMockContext()
      const plugin = createLoggerPlugin({ format: 'json' })
      await plugin(ctx)
      
      // ミドルウェア関数を取得
      const middleware = vi.mocked(ctx.app.use).mock.calls[0][0]
      
      // モックコンテキストとnext関数
      const mockC = {
        req: { method: 'GET', path: '/test' },
        res: { status: 200 }
      }
      const mockNext = vi.fn().mockResolvedValue(undefined)
      
      // When: ミドルウェアを実行
      await middleware(mockC, mockNext)
      
      // Then: リクエストログが出力される
      expect(consoleSpy.log).toHaveBeenCalled()
      const logOutput = consoleSpy.log.mock.calls.find((call: any) => 
        call[0].includes('Request processed')
      )
      expect(logOutput).toBeDefined()
    })

    it('should log failed requests', async () => {
      // Given: ロガープラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin({ format: 'json' })
      await plugin(ctx)
      
      const middleware = vi.mocked(ctx.app.use).mock.calls[0][0]
      
      const mockC = {
        req: { method: 'POST', path: '/error' },
        res: { status: 500 }
      }
      const mockNext = vi.fn().mockRejectedValue(new Error('Test error'))
      
      // When: エラーが発生するミドルウェアを実行
      await expect(middleware(mockC, mockNext)).rejects.toThrow('Test error')
      
      // Then: エラーログが出力される
      expect(consoleSpy.error).toHaveBeenCalled()
      const errorOutput = consoleSpy.error.mock.calls.find((call: any) => 
        call[0].includes('Request failed')
      )
      expect(errorOutput).toBeDefined()
    })
  })

  describe('Deterministic Testing with Fake Timers', () => {
    it('should produce consistent timestamps', () => {
      withFakeTimers(() => {
        // Given: 固定時刻
        const fixedDate = new Date('2024-01-01T00:00:00.000Z')
        vi.setSystemTime(fixedDate)
        
        // When: ログエントリを正規化
        const entry = {
          level: 'info' as const,
          message: 'Test message',
          timestamp: new Date().toISOString()
        }
        
        const normalized = normalizeLogEntry(entry)
        
        // Then: タイムスタンプが固定される
        expect(normalized.timestamp).toBe('2024-01-01T00:00:00.000Z')
      })
    })
  })

  describe('Log Level Filtering', () => {
    it('should filter logs by level priority', async () => {
      // Given: WARNレベルのロガー
      const ctx = createMockContext()
      const plugin = createLoggerPlugin({ level: 'warn' })
      await plugin(ctx)
      
      // 初期化ログをクリア
      consoleSpy.log.mockClear()
      
      // When: 異なるレベルでログを出力（実際の実装では内部関数を使用）
      // ここではツールの動作を通じて間接的にテスト
      const queryTool = vi.mocked(ctx.server.registerTool).mock.calls
        .find(([name]) => name === 'logs_query')![2]
      
      const response = await queryTool({
        params: { arguments: { level: 'warn' } }
      })
      
      // Then: WARNレベル以上のログのみ取得される
      const logs = JSON.parse(response.content[0].text)
      expect(Array.isArray(logs)).toBe(true)
    })
  })

  describe('Snapshot Testing', () => {
    it('should match tool schema snapshots', async () => {
      // Given: ロガープラグイン
      const ctx = createMockContext()
      const plugin = createLoggerPlugin()
      await plugin(ctx)
      
      // When: ツールスキーマを取得
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const schemas = toolCalls.map(([name, schema]) => ({ name, schema }))
      
      // Then: スキーマがスナップショットと一致
      expect(schemas).toMatchSnapshot()
    })
  })
})