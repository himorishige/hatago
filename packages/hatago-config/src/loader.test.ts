import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { generateConfigTemplate, getDefaultConfig, loadConfig, validateConfig } from './loader.js'

describe('loadConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `hatago-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    // Clear environment variables
    delete process.env.HATAGO_TEST_VAR
    delete process.env.TEST_TOKEN
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  test('loads default configuration when no config file exists', async () => {
    const result = await loadConfig({ searchFrom: tempDir })

    expect(result.isEmpty).toBe(true)
    expect(result.filepath).toBeNull()
    expect(result.config).toEqual(getDefaultConfig())
  })

  test('loads JSONC configuration file', async () => {
    const configContent = `{
      // Test configuration
      "server": {
        "port": 9000,
        "hostname": "test-host"
      },
      "proxy": {
        "servers": [
          {
            "id": "test-server",
            "endpoint": "http://localhost:8080"
          }
        ]
      }
    }`

    const configPath = join(tempDir, 'hatago.config.jsonc')
    writeFileSync(configPath, configContent)

    const result = await loadConfig({ searchFrom: tempDir })

    expect(result.isEmpty).toBe(false)
    expect(result.filepath).toBe(configPath)
    expect(result.config.server?.port).toBe(9000)
    expect(result.config.server?.hostname).toBe('test-host')
    expect(result.config.proxy?.servers).toHaveLength(1)
    expect(result.config.proxy?.servers[0].id).toBe('test-server')
  })

  test('expands environment variables', async () => {
    process.env.TEST_TOKEN = 'secret-token-123'
    process.env.HATAGO_PORT = '9090'

    const configContent = `{
      "server": {
        "port": "\${HATAGO_PORT}",
        "hostname": "\${HOST:localhost}"
      },
      "proxy": {
        "servers": [
          {
            "id": "auth-server",
            "endpoint": "http://localhost:8080",
            "auth": {
              "type": "bearer",
              "token": "\${TEST_TOKEN}"
            }
          }
        ]
      }
    }`

    const configPath = join(tempDir, 'hatago.config.json')
    writeFileSync(configPath, configContent)

    const result = await loadConfig({ searchFrom: tempDir })

    expect(result.config.server?.port).toBe(9090) // Converted from string
    expect(result.config.server?.hostname).toBe('localhost') // Default value
    expect(result.config.proxy?.servers[0].auth?.token).toBe('secret-token-123')
  })

  test('validates configuration and throws error for invalid config', async () => {
    const configContent = `{
      "server": {
        "port": "not-a-number"
      },
      "proxy": {
        "servers": [
          {
            "id": "",
            "endpoint": "invalid-url"
          }
        ]
      }
    }`

    const configPath = join(tempDir, 'hatago.config.json')
    writeFileSync(configPath, configContent)

    await expect(loadConfig({ searchFrom: tempDir })).rejects.toThrow(
      'Configuration validation failed'
    )
  })

  test('skips validation when disabled', async () => {
    const configContent = `{
      "server": {
        "port": "not-a-number"
      }
    }`

    const configPath = join(tempDir, 'hatago.config.json')
    writeFileSync(configPath, configContent)

    const result = await loadConfig({
      searchFrom: tempDir,
      validate: false,
    })

    expect(result.config.server?.port).toBe('not-a-number')
  })
})

describe('validateConfig', () => {
  test('validates correct configuration', () => {
    const config = {
      server: { port: 8787 },
      proxy: { servers: [] },
    }

    expect(() => validateConfig(config)).not.toThrow()
  })

  test('throws error for invalid configuration', () => {
    const config = {
      server: { port: -1 },
    }

    expect(() => validateConfig(config)).toThrow('Configuration validation failed')
  })
})

describe('generateConfigTemplate', () => {
  test('generates valid configuration template', () => {
    const template = generateConfigTemplate()

    expect(template).toContain('"$schema"')
    expect(template).toContain('"proxy"')
    expect(template).toContain('"server"')
    expect(template).toContain('// JSON Schema reference')
  })
})
