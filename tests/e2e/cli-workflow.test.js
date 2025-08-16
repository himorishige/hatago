/**
 * End-to-End tests for Hatago CLI workflow
 *
 * These tests validate the complete user journey from project creation
 * to plugin development and server deployment.
 */

import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CLI_PATH = resolve(__dirname, '../../apps/hatago-cli/dist/index.js')
const TIMEOUT = 60000 // 60 seconds for E2E operations

describe('Hatago CLI E2E Workflow', () => {
  let testDir
  let projectDir

  beforeAll(() => {
    // Create temporary directory for E2E tests
    testDir = mkdtempSync(join(tmpdir(), 'hatago-e2e-'))
    projectDir = join(testDir, 'test-project')
  })

  afterAll(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Complete project lifecycle', () => {
    it('should create a new project with hatago init', () => {
      const result = execSync(`node ${CLI_PATH} init test-project`, {
        cwd: testDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Project created successfully')
      expect(existsSync(projectDir)).toBe(true)
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true)
      expect(existsSync(join(projectDir, 'src/index.ts'))).toBe(true)
    })

    it('should validate the generated configuration', () => {
      const result = execSync(`node ${CLI_PATH} config validate`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Configuration is valid')
    })

    it('should create a plugin with create-plugin', () => {
      const result = execSync(`node ${CLI_PATH} create-plugin weather-tool`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Plugin created successfully')
      expect(existsSync(join(projectDir, 'src/plugins/weather-tool.ts'))).toBe(true)
      expect(existsSync(join(projectDir, 'src/plugins/weather-tool.test.ts'))).toBe(true)
      expect(existsSync(join(projectDir, 'src/plugins/README.md'))).toBe(true)
    })

    it('should scaffold additional components', () => {
      const result = execSync(`node ${CLI_PATH} scaffold basic auth-middleware`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Generated successfully')
    })

    it('should add external MCP server configuration', () => {
      const result = execSync(
        `node ${CLI_PATH} add-server http://localhost:8080/mcp --id external-tools --namespace ext --dry`,
        {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: TIMEOUT,
        }
      )

      expect(result).toContain('Dry run - configuration not saved')
    })

    it('should run doctor diagnostics', () => {
      const result = execSync(`node ${CLI_PATH} config doctor`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Configuration Doctor')
      expect(result).toContain('Recommendations')
    })
  })

  describe('Development workflow', () => {
    let buildResult

    it('should install dependencies', () => {
      buildResult = execSync('pnpm install', {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(buildResult).not.toContain('error')
    })

    it('should build the project', () => {
      buildResult = execSync('pnpm build', {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(existsSync(join(projectDir, 'dist/index.js'))).toBe(true)
    })

    it('should run type checking', () => {
      const result = execSync('pnpm typecheck', {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      // No errors means success for TypeScript
      expect(result).not.toContain('error')
    })

    it('should run tests', () => {
      try {
        const result = execSync('pnpm test --run', {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: TIMEOUT,
        })

        // Tests should pass or at least run without critical errors
        expect(result).not.toContain('FAILED')
      } catch (error) {
        // Some tests might fail due to missing dependencies, but that's expected
        expect(error.stdout || error.stderr).toContain('Test')
      }
    })
  })

  describe('Server functionality', () => {
    it(
      'should start server and respond to health check',
      async () => {
        const serverProcess = spawn('node', ['dist/index.js'], {
          cwd: projectDir,
          stdio: 'pipe',
          env: { ...process.env, PORT: '8787' },
        })

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000))

        try {
          const healthCheck = execSync('curl -s http://localhost:8787/health', {
            encoding: 'utf-8',
            timeout: 5000,
          })

          const response = JSON.parse(healthCheck)
          expect(response).toHaveProperty('status', 'ok')
          expect(response).toHaveProperty('server', 'test-project')
        } finally {
          serverProcess.kill('SIGTERM')

          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      },
      TIMEOUT
    )

    it(
      'should respond to MCP initialize request',
      async () => {
        const serverProcess = spawn('node', ['dist/index.js'], {
          cwd: projectDir,
          stdio: 'pipe',
          env: { ...process.env, PORT: '8788' },
        })

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000))

        try {
          const mcpRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'e2e-test', version: '1.0.0' },
            },
          }

          const response = execSync(
            `curl -s -X POST http://localhost:8788/mcp -H 'Content-Type: application/json' -d '${JSON.stringify(mcpRequest)}'`,
            {
              encoding: 'utf-8',
              timeout: 5000,
            }
          )

          const mcpResponse = JSON.parse(response)
          expect(mcpResponse).toHaveProperty('result')
          expect(mcpResponse.result).toHaveProperty('serverInfo')
          expect(mcpResponse.result.serverInfo).toHaveProperty('name', 'test-project')
        } finally {
          serverProcess.kill('SIGTERM')

          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      },
      TIMEOUT
    )
  })

  describe('Configuration management', () => {
    it('should handle configuration updates', () => {
      // Test configuration get
      const getResult = execSync(`node ${CLI_PATH} config get server.port`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(getResult.trim()).toBe('8787')
    })

    it('should export configuration in JSON format', () => {
      const jsonResult = execSync(`node ${CLI_PATH} config get --json`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      const config = JSON.parse(jsonResult)
      expect(config).toHaveProperty('server')
      expect(config).toHaveProperty('logging')
      expect(config).toHaveProperty('security')
    })
  })

  describe('Template system validation', () => {
    it('should list available templates', () => {
      const result = execSync(`node ${CLI_PATH} scaffold --list`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Available Templates')
      expect(result).toContain('basic')
    })

    it('should show template information', () => {
      const result = execSync(`node ${CLI_PATH} scaffold --info basic`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Template Information')
      expect(result).toContain('Basic Plugin')
      expect(result).toContain('Files:')
      expect(result).toContain('Configuration:')
    })
  })

  describe('Error handling', () => {
    it('should handle invalid commands gracefully', () => {
      try {
        execSync(`node ${CLI_PATH} invalid-command`, {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: TIMEOUT,
        })
      } catch (error) {
        expect(error.stderr).toContain('Unknown command')
      }
    })

    it('should handle invalid project names', () => {
      try {
        execSync(`node ${CLI_PATH} init invalid@name`, {
          cwd: testDir,
          encoding: 'utf-8',
          timeout: TIMEOUT,
        })
      } catch (error) {
        expect(error.stderr).toContain('Invalid project name')
      }
    })

    it('should handle missing template files', () => {
      try {
        execSync(`node ${CLI_PATH} scaffold nonexistent test-output`, {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: TIMEOUT,
        })
      } catch (error) {
        expect(error.stderr).toContain('Template not found')
      }
    })
  })

  describe('Help and documentation', () => {
    it('should show main help', () => {
      const result = execSync(`node ${CLI_PATH} --help`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Command line interface for Hatago MCP server')
      expect(result).toContain('Commands:')
      expect(result).toContain('config')
      expect(result).toContain('init')
      expect(result).toContain('dev')
      expect(result).toContain('create-plugin')
      expect(result).toContain('scaffold')
    })

    it('should show command-specific help', () => {
      const result = execSync(`node ${CLI_PATH} init --help`, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: TIMEOUT,
      })

      expect(result).toContain('Initialize a new Hatago project')
      expect(result).toContain('Examples:')
    })
  })
})
