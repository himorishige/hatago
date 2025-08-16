/**
 * Logger テスト
 * PIIマスキング、レベルフィルタリング、出力先管理、子ロガーをテスト
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { logger, createLogger, setLogLevel, getLogLevel } from '../../src/logger-advanced.js'
import type { LogLevel, LogFormat, HatagoMode } from '../../src/logger-advanced.js'
import { captureConsole, mockEnv } from '../../../../tests/helpers/test-utils.js'

describe('Logger', () => {
  let originalEnv: typeof process.env
  let envMock: { restore: () => void }
  let consoleMock: ReturnType<typeof captureConsole>

  beforeEach(() => {
    originalEnv = { ...process.env }
    envMock = mockEnv({})
    consoleMock = captureConsole()
  })

  afterEach(() => {
    envMock.restore()
    consoleMock.restore()
    // グローバルロガーの設定をリセット
    setLogLevel('info')
  })

  describe('Log Level Management', () => {
    it('should respect LOG_LEVEL environment variable', () => {
      envMock.restore()
      envMock = mockEnv({ LOG_LEVEL: 'debug' })
      
      const testLogger = createLogger()
      
      expect(testLogger.isLevelEnabled('debug')).toBe(true)
      expect(testLogger.isLevelEnabled('trace')).toBe(false)
    })

    it('should filter logs by level', async () => {
      const testLogger = createLogger({ level: 'warn' })
      
      await testLogger.debug('debug message')
      await testLogger.info('info message')
      await testLogger.warn('warn message')
      await testLogger.error('error message')
      
      // warn レベル以上のみ出力される
      expect(consoleMock.logs).toHaveLength(0) // stdout に出力されない
      expect(consoleMock.errors).toHaveLength(2) // warn と error が stderr に出力
    })

    it('should handle level hierarchy correctly', () => {
      const testLogger = createLogger({ level: 'info' })
      
      expect(testLogger.isLevelEnabled('trace')).toBe(false)
      expect(testLogger.isLevelEnabled('debug')).toBe(false)
      expect(testLogger.isLevelEnabled('info')).toBe(true)
      expect(testLogger.isLevelEnabled('warn')).toBe(true)
      expect(testLogger.isLevelEnabled('error')).toBe(true)
      expect(testLogger.isLevelEnabled('fatal')).toBe(true)
    })

    it('should update global log level', () => {
      setLogLevel('debug')
      expect(getLogLevel()).toBe('debug')
      
      setLogLevel('error')
      expect(getLogLevel()).toBe('error')
    })
  })

  describe('Output Format', () => {
    it('should use pretty format by default', async () => {
      const testLogger = createLogger({ level: 'info', format: 'pretty' })
      
      await testLogger.info('test message')
      
      // pretty format はタイムスタンプとレベルを含む
      const output = consoleMock.logs.join('')
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/)
      expect(output).toContain('INFO ')
      expect(output).toContain('test message')
    })

    it('should use JSON format when configured', async () => {
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      await testLogger.info('test message', { key: 'value' })
      
      const output = consoleMock.logs[0]
      const parsed = JSON.parse(output)
      
      expect(parsed.level).toBe('info')
      expect(parsed.msg).toBe('test message')
      expect(parsed.key).toBe('value')
      expect(parsed.time).toBeDefined()
    })

    it('should handle color output based on environment', async () => {
      envMock.restore()
      envMock = mockEnv({ FORCE_COLOR: '1' })
      
      const testLogger = createLogger({ level: 'info', format: 'pretty' })
      
      await testLogger.error('error message')
      
      // カラー出力が有効な場合、ANSI エスケープシーケンスが含まれる
      const output = consoleMock.errors.join('')
      expect(output).toMatch(/\x1b\[\d+m/) // ANSI カラーコード
    })

    it('should disable colors when NO_COLOR is set', async () => {
      envMock.restore()
      envMock = mockEnv({ NO_COLOR: '1' })
      
      const testLogger = createLogger({ level: 'info', format: 'pretty' })
      
      await testLogger.error('error message')
      
      const output = consoleMock.errors.join('')
      expect(output).not.toMatch(/\x1b\[\d+m/) // ANSI カラーコードが含まれない
    })
  })

  describe('Transport Mode Handling', () => {
    it('should route all output to stderr in stdio mode', async () => {
      const testLogger = createLogger({ level: 'info', transport: 'stdio' })
      
      await testLogger.info('info message')
      await testLogger.error('error message')
      
      // stdio モードでは全て stderr に出力
      expect(consoleMock.logs).toHaveLength(0)
      expect(consoleMock.errors).toHaveLength(2)
    })

    it('should route appropriately in HTTP mode', async () => {
      envMock.restore()
      envMock = mockEnv({ NODE_ENV: 'development' })
      
      const testLogger = createLogger({ level: 'info', transport: 'http' })
      
      await testLogger.info('info message')
      await testLogger.error('error message')
      
      // HTTP モードでは info は stdout、error は stderr
      expect(consoleMock.logs).toHaveLength(1)
      expect(consoleMock.errors).toHaveLength(1)
    })

    it('should guard stdout in stdio mode', async () => {
      const testLogger = createLogger({ transport: 'stdio' })
      
      // stdout への直接書き込みを試行
      process.stdout.write('direct stdout write')
      
      // ガードによってリダイレクトされることを確認
      expect(consoleMock.errors.some(err => err.includes('STDOUT-GUARD'))).toBe(true)
    })
  })

  describe('PII Masking', () => {
    it('should mask sensitive keys by default', async () => {
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      await testLogger.info('test message', {
        password: 'secret123',
        token: 'abc-def-ghi',
        api_key: 'key123',
        authorization: 'Bearer token123',
        safe_data: 'not masked',
      })
      
      const output = JSON.parse(consoleMock.logs[0])
      
      expect(output.password).toBe('[REDACTED]')
      expect(output.token).toBe('[REDACTED]')
      expect(output.api_key).toBe('[REDACTED]')
      expect(output.authorization).toBe('[REDACTED]')
      expect(output.safe_data).toBe('not masked')
    })

    it('should use Noren for advanced PII detection when enabled', async () => {
      envMock.restore()
      envMock = mockEnv({ NOREN_MASKING: 'true' })
      
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      // JWT トークンのようなパターンをテスト
      await testLogger.info('test message', {
        user_input: 'My email is john@example.com and my JWT is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        normal_text: 'This is normal text',
      })
      
      const output = JSON.parse(consoleMock.logs[0])
      
      // Noren が有効な場合、文字列内の PII も検出される
      expect(output.user_input).toContain('[REDACTED]')
      expect(output.normal_text).toBe('This is normal text')
    })

    it('should handle Noren failure gracefully', async () => {
      envMock.restore()
      envMock = mockEnv({ NOREN_MASKING: 'true' })
      
      // Noren の失敗をシミュレート
      vi.doMock('@himorishige/noren-core', () => {
        throw new Error('Noren failed to load')
      })
      
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      // エラーが発生しても処理が続行される
      await expect(testLogger.info('test message', { data: 'value' })).resolves.not.toThrow()
    })

    it('should allow disabling PII masking', async () => {
      envMock.restore()
      envMock = mockEnv({ NOREN_MASKING: 'false' })
      
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      await testLogger.info('test message', {
        password: 'secret123',
        token: 'abc-def-ghi',
      })
      
      const output = JSON.parse(consoleMock.logs[0])
      
      // マスキングが無効な場合、従来のキーベースマスキングのみ適用
      expect(output.password).toBe('[REDACTED]')
      expect(output.token).toBe('[REDACTED]')
    })

    it('should handle custom redact keys', async () => {
      envMock.restore()
      envMock = mockEnv({ LOG_REDACT: 'custom_secret,another_key' })
      
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      await testLogger.info('test message', {
        custom_secret: 'should be redacted',
        another_key: 'also redacted',
        normal_key: 'not redacted',
      })
      
      const output = JSON.parse(consoleMock.logs[0])
      
      expect(output.custom_secret).toBe('[REDACTED]')
      expect(output.another_key).toBe('[REDACTED]')
      expect(output.normal_key).toBe('not redacted')
    })
  })

  describe('Child Logger', () => {
    it('should inherit configuration from parent', async () => {
      const parentLogger = createLogger({ level: 'warn', format: 'json' })
      const childLogger = parentLogger.child({ service: 'test-service' })
      
      await childLogger.info('info message') // フィルタされる
      await childLogger.warn('warn message')
      
      expect(consoleMock.errors).toHaveLength(1)
      
      const output = JSON.parse(consoleMock.errors[0])
      expect(output.level).toBe('warn')
      expect(output.service).toBe('test-service')
    })

    it('should preserve parent context in child', async () => {
      const parentLogger = createLogger({ level: 'info', format: 'json' })
      const parentWithContext = parentLogger.child({ request_id: 'req-123' })
      const childLogger = parentWithContext.child({ session_id: 'sess-456' })
      
      await childLogger.info('test message')
      
      const output = JSON.parse(consoleMock.logs[0])
      expect(output.request_id).toBe('req-123')
      expect(output.session_id).toBe('sess-456')
    })

    it('should override parent context when same key is used', async () => {
      const parentLogger = createLogger({ level: 'info', format: 'json' })
      const parentWithContext = parentLogger.child({ user_id: 'user-123' })
      const childLogger = parentWithContext.child({ user_id: 'user-456' })
      
      await childLogger.info('test message')
      
      const output = JSON.parse(consoleMock.logs[0])
      expect(output.user_id).toBe('user-456') // 子の値で上書き
    })
  })

  describe('Sampling and Rate Limiting', () => {
    it('should respect sample rate', async () => {
      const testLogger = createLogger({ 
        level: 'info', 
        format: 'json',
        sampleRate: 0.1 // 10% のサンプリング
      })
      
      // 数学的乱数をモック
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // 50% > 10% なのでスキップ
      
      await testLogger.info('sampled out message')
      
      expect(consoleMock.logs).toHaveLength(0)
      
      // サンプリング範囲内の値
      vi.spyOn(Math, 'random').mockReturnValue(0.05) // 5% < 10% なので出力
      
      await testLogger.info('sampled in message')
      
      expect(consoleMock.logs).toHaveLength(1)
    })

    it('should never sample fatal and error levels', async () => {
      const testLogger = createLogger({ 
        level: 'info',
        format: 'json',
        sampleRate: 0 // 0% サンプリング（通常は全てスキップ）
      })
      
      vi.spyOn(Math, 'random').mockReturnValue(0.9) // サンプリング範囲外
      
      await testLogger.info('should be skipped')
      await testLogger.error('should not be skipped')
      await testLogger.fatal('should not be skipped')
      
      expect(consoleMock.logs).toHaveLength(0)
      expect(consoleMock.errors).toHaveLength(2) // error と fatal
    })
  })

  describe('Error Handling and Fallback', () => {
    it('should handle write errors gracefully', async () => {
      // stderr の write をモック
      const originalStderrWrite = process.stderr.write
      process.stderr.write = vi.fn().mockImplementation(() => {
        throw new Error('Write failed')
      })
      
      const testLogger = createLogger({ level: 'error' })
      
      // エラーが発生しても処理が継続される
      await expect(testLogger.error('error message')).resolves.not.toThrow()
      
      process.stderr.write = originalStderrWrite
    })

    it('should handle JSON serialization errors', async () => {
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      // 循環参照オブジェクト
      const circular: any = { prop: 'value' }
      circular.self = circular
      
      await testLogger.info('test message', circular)
      
      // JSON 化でエラーが発生しても処理が継続される
      expect(consoleMock.logs.length).toBeGreaterThan(0)
    })

    it('should exit process on fatal level', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called')
      })
      
      const testLogger = createLogger({ level: 'fatal' })
      
      await expect(testLogger.fatal('fatal error')).rejects.toThrow('Process exit called')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Metadata and Context', () => {
    it('should include transport and session information', async () => {
      const testLogger = createLogger({ 
        level: 'info', 
        format: 'json', 
        transport: 'http' 
      })
      
      const contextLogger = testLogger.child({ session_id: 'sess-123' })
      
      await contextLogger.info('test message', { duration_ms: 150 })
      
      const output = JSON.parse(consoleMock.logs[0])
      expect(output.transport).toBe('http')
      expect(output.session_id).toBe('sess-123')
      expect(output.duration_ms).toBe(150)
      expect(output.time).toBeDefined()
    })

    it('should format error information properly', async () => {
      const testLogger = createLogger({ level: 'debug', format: 'json' })
      
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test.js:1:1'
      
      await testLogger.error('Error occurred', {
        error: {
          code: 'ERR_TEST',
          stack: error.stack,
        },
      })
      
      const output = JSON.parse(consoleMock.errors[0])
      expect(output.error.code).toBe('ERR_TEST')
      expect(output.error.stack).toContain('test.js:1:1')
    })

    it('should handle method and tool context', async () => {
      const testLogger = createLogger({ level: 'info', format: 'json' })
      
      const methodLogger = testLogger.child({ 
        tool: 'hello_world',
        method: 'tools/call',
        request_id: 'req-456',
      })
      
      await methodLogger.info('Tool executed successfully')
      
      const output = JSON.parse(consoleMock.logs[0])
      expect(output.tool).toBe('hello_world')
      expect(output.method).toBe('tools/call')
      expect(output.request_id).toBe('req-456')
    })
  })
})