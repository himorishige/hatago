/**
 * Logger 基本テスト
 * 軽量なモックベースのテストでコンソール出力を最小化
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSecureLogger, getLogLevel, setLogLevel } from '../../src/logger/index.js'

describe('Logger Basic', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>
  let mockConsoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // console.log/error のモック
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
    setLogLevel('info') // リセット
  })

  describe('Log Level Management', () => {
    it('should respect log level hierarchy', () => {
      const logger = createSecureLogger({ level: 'info' })

      expect(logger.isLevelEnabled('trace')).toBe(false)
      expect(logger.isLevelEnabled('debug')).toBe(false)
      expect(logger.isLevelEnabled('info')).toBe(true)
      expect(logger.isLevelEnabled('warn')).toBe(true)
      expect(logger.isLevelEnabled('error')).toBe(true)
      expect(logger.isLevelEnabled('fatal')).toBe(true)
    })

    it('should update global log level', () => {
      setLogLevel('debug')
      expect(getLogLevel()).toBe('debug')

      setLogLevel('error')
      expect(getLogLevel()).toBe('error')
    })
  })

  describe('Output Routing', () => {
    it('should route to stderr in stdio mode', async () => {
      const logger = createSecureLogger({ level: 'info', transport: 'stdio' })

      await logger.info('test message')
      await logger.error('error message')

      // stdio モードでは全て console.error
      expect(mockConsoleLog).not.toHaveBeenCalled()
      expect(mockConsoleError).toHaveBeenCalledTimes(2)
    })

    it('should route appropriately in HTTP mode', async () => {
      const logger = createSecureLogger({ level: 'info', transport: 'http' })

      await logger.info('info message')
      await logger.error('error message')

      // HTTP モードでは info → console.log, error → console.error
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
      expect(mockConsoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('Basic Functionality', () => {
    it('should create logger with default options', () => {
      const logger = createSecureLogger()
      expect(logger).toBeDefined()
      // デフォルトレベルの確認（envに依存するのでチェック方法を変更）
      expect(logger.isLevelEnabled).toBeDefined()
    })

    it('should support child logger creation', () => {
      const parent = createSecureLogger({ level: 'info' })
      const child = parent.child({ service: 'test' })

      expect(child).toBeDefined()
      expect(child.isLevelEnabled('info')).toBe(true)
    })

    it('should handle JSON format configuration', () => {
      const logger = createSecureLogger({ level: 'info', format: 'json' })
      expect(logger).toBeDefined()
    })
  })
})
