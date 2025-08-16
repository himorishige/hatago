import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Test CLI helper for running hatago commands
 */
export class TestCLI {
  private cliPath: string
  private tempDir: string

  constructor() {
    this.cliPath = resolve(__dirname, '../../dist/index.js')
    this.tempDir = mkdtempSync(join(tmpdir(), 'hatago-test-'))
  }

  /**
   * Execute CLI command
   */
  run(
    command: string,
    options: {
      cwd?: string
      timeout?: number
      expectError?: boolean
    } = {}
  ): { stdout: string; stderr: string; code: number } {
    const { cwd = this.tempDir, timeout = 10000, expectError = false } = options

    try {
      const stdout = execSync(`node ${this.cliPath} ${command}`, {
        cwd,
        encoding: 'utf-8',
        timeout,
        stdio: 'pipe',
      })

      return {
        stdout: stdout.toString(),
        stderr: '',
        code: 0,
      }
    } catch (error: unknown) {
      if (expectError) {
        const err = error as { stdout?: Buffer; stderr?: Buffer; status?: number }
        return {
          stdout: err.stdout?.toString() || '',
          stderr: err.stderr?.toString() || '',
          code: err.status || 1,
        }
      }
      throw error
    }
  }

  /**
   * Create a test file in temp directory
   */
  createFile(path: string, content: string): string {
    const fullPath = join(this.tempDir, path)
    const dir = join(fullPath, '..')

    // Ensure directory exists
    execSync(`mkdir -p "${dir}"`)
    writeFileSync(fullPath, content)

    return fullPath
  }

  /**
   * Check if file exists in temp directory
   */
  fileExists(path: string): boolean {
    return existsSync(join(this.tempDir, path))
  }

  /**
   * Get temp directory path
   */
  getTempDir(): string {
    return this.tempDir
  }

  /**
   * Clean up temp directory
   */
  cleanup(): void {
    try {
      rmSync(this.tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create mock configuration file
 */
export function createMockConfig(overrides: Record<string, unknown> = {}): string {
  const defaultConfig = {
    server: {
      port: 8787,
      hostname: 'localhost',
      cors: true,
    },
    proxy: {
      servers: [],
      namespaceStrategy: 'prefix',
    },
    logging: {
      level: 'info',
      format: 'pretty',
    },
    security: {
      requireAuth: false,
    },
    ...overrides,
  }

  return JSON.stringify(defaultConfig, null, 2)
}

/**
 * Create mock template config
 */
export function createMockTemplateConfig(overrides: Record<string, unknown> = {}): string {
  const defaultConfig = {
    name: 'test-template',
    displayName: 'Test Template',
    description: 'A test template',
    category: 'test',
    tags: ['test'],
    author: 'Test Author',
    version: '1.0.0',
    files: [
      {
        template: 'test.hbs',
        output: '{{name}}.ts',
        description: 'Test file',
      },
    ],
    prompts: [
      {
        name: 'description',
        type: 'input',
        message: 'Description:',
        default: 'Test description',
      },
    ],
    ...overrides,
  }

  return JSON.stringify(defaultConfig, null, 2)
}

/**
 * Mock template file content
 */
export function createMockTemplate(): string {
  return `// {{name}} - {{description}}
// Generated on {{timestamp}}
// Author: {{author}}

export const {{camelCase name}} = {
  name: '{{name}}',
  description: '{{description}}',
  version: '{{version}}',
}
`
}

/**
 * Setup test environment
 */
export function setupTestEnv(): {
  cli: TestCLI
  cleanup: () => void
} {
  const cli = new TestCLI()

  const cleanup = () => {
    cli.cleanup()
  }

  return { cli, cleanup }
}
