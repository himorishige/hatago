/**
 * ConfigLoader テスト
 * 設定ファイルの読み込み、マージ、バリデーションをテスト
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTempDir, mockEnv } from '../../../../tests/helpers/test-utils.js'
import { loadConfig } from '../../../src/config/loader.js'
import type { HatagoConfig } from '../../../src/config/types.js'

describe('ConfigLoader', () => {
  let tempDir: string
  let _originalEnv: typeof process.env
  let envMock: { restore: () => void }

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(tempDir, { recursive: true })
    _originalEnv = { ...process.env }
    envMock = mockEnv({})
  })

  afterEach(() => {
    envMock.restore()
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Default Configuration', () => {
    it('should return default configuration when no config file exists', async () => {
      const result = await loadConfig(join(tempDir, 'nonexistent.json'))

      expect(result.config).toBeDefined()
      expect(result.config.server.port).toBe(8787)
      expect(result.config.server.hostname).toBe('localhost')
      expect(result.config.proxy.namespaceStrategy).toBe('prefix')
      expect(result.config.logging.level).toBe('info')
      expect(result.filepath).toBeNull()
    })

    it('should have consistent default values', async () => {
      const result = await loadConfig()

      expect(result.config.proxy.servers).toEqual([])
      expect(result.config.proxy.conflictResolution).toBe('error')
      expect(result.config.security.requireAuth).toBe(false)
      expect(result.config.security.allowedOrigins).toEqual(['*'])
    })
  })

  describe('Configuration File Loading', () => {
    it('should load valid JSON configuration', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config: Partial<HatagoConfig> = {
        server: {
          port: 9999,
          hostname: '0.0.0.0',
          cors: false,
          timeout: 60000,
        },
        logging: {
          level: 'debug',
          format: 'json',
          output: 'file',
        },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const result = await loadConfig(configPath)

      expect(result.config.server.port).toBe(9999)
      expect(result.config.server.hostname).toBe('0.0.0.0')
      expect(result.config.server.cors).toBe(false)
      expect(result.config.logging.level).toBe('debug')
      expect(result.config.logging.format).toBe('json')
      expect(result.filepath).toBe(configPath)
    })

    it('should merge with default configuration', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const partialConfig = {
        server: {
          port: 3000,
        },
      }

      writeFileSync(configPath, JSON.stringify(partialConfig, null, 2))

      const result = await loadConfig(configPath)

      // オーバーライドされた値
      expect(result.config.server.port).toBe(3000)
      // デフォルト値が保持される
      expect(result.config.server.hostname).toBe('localhost')
      expect(result.config.server.cors).toBe(true)
      expect(result.config.logging.level).toBe('info')
    })

    it('should handle deeply nested configuration', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        proxy: {
          namespace: {
            separator: '::',
            caseSensitive: true,
            maxLength: 100,
            autoPrefix: {
              enabled: false,
              format: '{index}_{server}',
            },
          },
        },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const result = await loadConfig(configPath)

      expect(result.config.proxy.namespace.separator).toBe('::')
      expect(result.config.proxy.namespace.caseSensitive).toBe(true)
      expect(result.config.proxy.namespace.maxLength).toBe(100)
      expect(result.config.proxy.namespace.autoPrefix.enabled).toBe(false)
      expect(result.config.proxy.namespace.autoPrefix.format).toBe('{index}_{server}')
      // デフォルトが保持される
      expect(result.config.proxy.namespaceStrategy).toBe('prefix')
    })
  })

  describe('Environment Variable Override', () => {
    it('should override config with environment variables', async () => {
      envMock.restore()
      envMock = mockEnv({
        HATAGO_PORT: '5000',
        HATAGO_HOSTNAME: 'example.com',
        HATAGO_LOG_LEVEL: 'error',
        HATAGO_REQUIRE_AUTH: 'true',
      })

      const result = await loadConfig()

      expect(result.config.server.port).toBe(5000)
      expect(result.config.server.hostname).toBe('example.com')
      expect(result.config.logging.level).toBe('error')
      expect(result.config.security.requireAuth).toBe(true)
    })

    it('should handle boolean environment variables correctly', async () => {
      envMock.restore()
      envMock = mockEnv({
        HATAGO_CORS: 'false',
        HATAGO_REQUIRE_AUTH: 'true',
        HATAGO_RATE_LIMIT_ENABLED: 'true',
      })

      const result = await loadConfig()

      expect(result.config.server.cors).toBe(false)
      expect(result.config.security.requireAuth).toBe(true)
      expect(result.config.security.rateLimit.enabled).toBe(true)
    })

    it('should handle numeric environment variables correctly', async () => {
      envMock.restore()
      envMock = mockEnv({
        HATAGO_PORT: '3000',
        HATAGO_TIMEOUT: '45000',
        HATAGO_RATE_LIMIT_WINDOW_MS: '120000',
        HATAGO_RATE_LIMIT_MAX_REQUESTS: '200',
      })

      const result = await loadConfig()

      expect(result.config.server.port).toBe(3000)
      expect(result.config.server.timeout).toBe(45000)
      expect(result.config.security.rateLimit.windowMs).toBe(120000)
      expect(result.config.security.rateLimit.maxRequests).toBe(200)
    })

    it('should prioritize environment variables over config file', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        server: { port: 8000 },
        logging: { level: 'debug' },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      envMock.restore()
      envMock = mockEnv({
        HATAGO_PORT: '9000',
        HATAGO_LOG_LEVEL: 'error',
      })

      const result = await loadConfig(configPath)

      // 環境変数が優先される
      expect(result.config.server.port).toBe(9000)
      expect(result.config.logging.level).toBe('error')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      writeFileSync(configPath, '{ invalid json }')

      await expect(loadConfig(configPath)).rejects.toThrow()
    })

    it('should handle missing file gracefully', async () => {
      const configPath = join(tempDir, 'missing.json')

      const result = await loadConfig(configPath)

      // デフォルト設定が返される
      expect(result.config.server.port).toBe(8787)
      expect(result.filepath).toBeNull()
    })

    it('should handle permission errors', async () => {
      const configPath = join(tempDir, 'readonly.json')
      writeFileSync(configPath, '{}')

      // ファイルを読み取り専用にして、読み込み権限を削除をシミュレート
      vi.doMock('node:fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
      }))

      await expect(loadConfig(configPath)).rejects.toThrow('permission denied')
    })
  })

  describe('Configuration Validation', () => {
    it('should reject invalid port numbers', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        server: { port: -1 },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      await expect(loadConfig(configPath)).rejects.toThrow()
    })

    it('should reject invalid log levels', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        logging: { level: 'invalid' },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      await expect(loadConfig(configPath)).rejects.toThrow()
    })

    it('should reject invalid namespace strategies', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        proxy: { namespaceStrategy: 'invalid' },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      await expect(loadConfig(configPath)).rejects.toThrow()
    })

    it('should reject invalid conflict resolution strategies', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        proxy: { conflictResolution: 'invalid' },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      await expect(loadConfig(configPath)).rejects.toThrow()
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle complete proxy configuration', async () => {
      const configPath = join(tempDir, 'hatago.config.json')
      const config = {
        proxy: {
          servers: [
            {
              id: 'server1',
              endpoint: 'http://localhost:3000',
              description: 'Test server 1',
              timeout: 5000,
              auth: {
                type: 'bearer',
                token: 'secret-token',
              },
              healthCheck: {
                enabled: true,
                interval: 30000,
              },
            },
            {
              id: 'server2',
              endpoint: 'http://localhost:3001',
              description: 'Test server 2',
              auth: {
                type: 'basic',
                username: 'user',
                password: 'pass',
              },
            },
          ],
          namespaceStrategy: 'flat',
          conflictResolution: 'first-wins',
        },
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2))

      const result = await loadConfig(configPath)

      expect(result.config.proxy.servers).toHaveLength(2)
      expect(result.config.proxy.servers[0].id).toBe('server1')
      expect(result.config.proxy.servers[0].endpoint).toBe('http://localhost:3000')
      expect(result.config.proxy.servers[0].auth?.type).toBe('bearer')
      expect(result.config.proxy.servers[0].auth?.token).toBe('secret-token')
      expect(result.config.proxy.servers[0].healthCheck?.enabled).toBe(true)
      expect(result.config.proxy.namespaceStrategy).toBe('flat')
      expect(result.config.proxy.conflictResolution).toBe('first-wins')
    })

    it('should handle array environment variables', async () => {
      envMock.restore()
      envMock = mockEnv({
        HATAGO_ALLOWED_ORIGINS: 'https://example.com,https://app.example.com',
      })

      const result = await loadConfig()

      expect(result.config.security.allowedOrigins).toEqual([
        'https://example.com',
        'https://app.example.com',
      ])
    })

    it('should handle nested object environment variables', async () => {
      envMock.restore()
      envMock = mockEnv({
        HATAGO_NAMESPACE_SEPARATOR: '|',
        HATAGO_NAMESPACE_CASE_SENSITIVE: 'true',
        HATAGO_NAMESPACE_MAX_LENGTH: '50',
        HATAGO_NAMESPACE_AUTO_PREFIX_ENABLED: 'false',
      })

      const result = await loadConfig()

      expect(result.config.proxy.namespace.separator).toBe('|')
      expect(result.config.proxy.namespace.caseSensitive).toBe(true)
      expect(result.config.proxy.namespace.maxLength).toBe(50)
      expect(result.config.proxy.namespace.autoPrefix.enabled).toBe(false)
    })
  })
})
