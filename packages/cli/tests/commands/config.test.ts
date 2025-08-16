import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TestCLI, createMockConfig, setupTestEnv } from '../helpers/test-utils.js'

describe('config command', () => {
  let cli: TestCLI
  let cleanup: () => void

  beforeEach(() => {
    ;({ cli, cleanup } = setupTestEnv())
  })

  afterEach(() => {
    cleanup()
  })

  describe('config init', () => {
    it('should create a new configuration file', () => {
      const result = cli.run('config init --force')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Created configuration file')
      expect(cli.fileExists('hatago.config.jsonc')).toBe(true)
    })

    it('should not overwrite existing config without --force', () => {
      // Create existing config
      cli.createFile('hatago.config.jsonc', '{}')

      const result = cli.run('config init', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('already exists')
    })

    it('should overwrite existing config with --force', () => {
      // Create existing config
      cli.createFile('hatago.config.jsonc', '{}')

      const result = cli.run('config init --force')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Created configuration file')
    })
  })

  describe('config validate', () => {
    it('should validate a valid configuration', () => {
      const config = createMockConfig()
      cli.createFile('hatago.config.jsonc', config)

      const result = cli.run('config validate')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Configuration is valid')
    })

    it('should report validation errors for invalid config', () => {
      const invalidConfig = JSON.stringify({ server: { port: 'invalid' } })
      cli.createFile('hatago.config.jsonc', invalidConfig)

      const result = cli.run('config validate', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('validation failed')
    })

    it('should fix common issues with --fix flag', () => {
      const fixableConfig = createMockConfig({
        proxy: {
          servers: [
            {
              id: 'test-server',
              endpoint: 'http://localhost:8080', // HTTP warning
            },
          ],
        },
      })
      cli.createFile('hatago.config.jsonc', fixableConfig)

      const result = cli.run('config validate')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Using HTTP endpoint')
    })
  })

  describe('config doctor', () => {
    it('should run comprehensive diagnostics', () => {
      const config = createMockConfig()
      cli.createFile('hatago.config.jsonc', config)

      const result = cli.run('config doctor')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Configuration Doctor')
      expect(result.stdout).toContain('Environment:')
      expect(result.stdout).toContain('Node.js:')
    })

    it('should show recommendations', () => {
      const result = cli.run('config doctor')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Recommendations:')
      expect(result.stdout).toContain('health checks')
    })
  })

  describe('config get', () => {
    beforeEach(() => {
      const config = createMockConfig({
        server: { port: 9999 },
        logging: { level: 'debug' },
      })
      cli.createFile('hatago.config.jsonc', config)
    })

    it('should get entire configuration', () => {
      const result = cli.run('config get')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('port')
      expect(result.stdout).toContain('9999')
    })

    it('should get specific configuration path', () => {
      const result = cli.run('config get server.port')

      expect(result.code).toBe(0)
      expect(result.stdout.trim()).toBe('9999')
    })

    it('should get nested configuration path', () => {
      const result = cli.run('config get logging.level')

      expect(result.code).toBe(0)
      expect(result.stdout.trim()).toBe('debug')
    })

    it('should report error for invalid path', () => {
      const result = cli.run('config get invalid.path', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('not found')
    })
  })

  describe('JSON output mode', () => {
    it('should output JSON when --json flag is used', () => {
      const result = cli.run('config doctor --json')

      expect(result.code).toBe(0)
      expect(() => JSON.parse(result.stdout)).not.toThrow()
    })

    it('should output JSON for validation results', () => {
      const config = createMockConfig()
      cli.createFile('hatago.config.jsonc', config)

      const result = cli.run('config validate --json')

      expect(result.code).toBe(0)
      const output = JSON.parse(result.stdout)
      expect(output).toHaveProperty('valid')
      expect(output).toHaveProperty('configPath')
    })
  })
})
