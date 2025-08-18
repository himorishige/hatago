/**
 * Test Server Spawn Helper
 * Manages test server lifecycle
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface TestServerOptions {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  waitForMessage?: string | RegExp
  timeout?: number
}

export class TestServer {
  private process?: ChildProcess
  private logs: string[] = []
  private errors: string[] = []
  private port?: number
  private baseUrl?: string

  constructor(private options: TestServerOptions) {}

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const env = {
      ...process.env,
      PORT: '0', // Use random port
      LOG_LEVEL: 'debug',
      LOG_FORMAT: 'json',
      ...this.options.env,
    }

    this.process = spawn(this.options.command, this.options.args ?? [], {
      env,
      cwd: this.options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Capture stdout
    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        this.logs.push(text)

        // Try to extract port from logs
        const portMatch = text.match(/(?:port|listening).*?(\d{4,5})/i)
        if (portMatch) {
          this.port = Number.parseInt(portMatch[1], 10)
          this.baseUrl = `http://localhost:${this.port}`
        }
      })
    }

    // Capture stderr
    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        this.errors.push(text)
      })
    }

    // Wait for server to be ready
    await this.waitForReady()
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.process) return

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        this.process?.kill('SIGKILL')
        resolve()
      }, 5000)

      this.process.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.process.kill('SIGTERM')
    })
  }

  /**
   * Wait for server to be ready
   */
  private async waitForReady(): Promise<void> {
    const timeout = this.options.timeout ?? 10000
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const checkReady = () => {
        // Check if process exited
        if (this.process?.exitCode !== null) {
          reject(new Error(`Server exited with code ${this.process.exitCode}`))
          return
        }

        // Check for wait message
        if (this.options.waitForMessage) {
          const pattern = this.options.waitForMessage
          const found = this.logs.some(log =>
            typeof pattern === 'string' ? log.includes(pattern) : pattern.test(log)
          )

          if (found) {
            resolve()
            return
          }
        }

        // Check for port
        if (this.port) {
          // Try to connect
          fetch(`http://localhost:${this.port}/health`)
            .then(() => resolve())
            .catch(() => {
              // Not ready yet
            })
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Server startup timeout'))
          return
        }

        // Continue checking
        setTimeout(checkReady, 100)
      }

      checkReady()
    })
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    if (!this.baseUrl) {
      throw new Error('Server URL not available')
    }
    return this.baseUrl
  }

  /**
   * Get server port
   */
  getPort(): number | undefined {
    return this.port
  }

  /**
   * Get server logs
   */
  getLogs(): string[] {
    return this.logs
  }

  /**
   * Get server errors
   */
  getErrors(): string[] {
    return this.errors
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.process !== undefined && this.process.exitCode === null
  }
}

/**
 * Start a test server for Hatago
 */
export async function startHatagoServer(options?: {
  env?: Record<string, string>
  plugins?: string[]
  timeout?: number
}): Promise<TestServer> {
  const server = new TestServer({
    command: 'pnpm',
    args: ['dev'],
    cwd: process.cwd(),
    env: {
      ...options?.env,
      HATAGO_PLUGINS: options?.plugins?.join(','),
    },
    waitForMessage: /Server listening|Ready at/i,
    timeout: options?.timeout,
  })

  await server.start()
  return server
}

/**
 * Start a test MCP server via npx
 */
export async function startMCPServer(
  packageName: string,
  options?: {
    args?: string[]
    env?: Record<string, string>
    timeout?: number
  }
): Promise<TestServer> {
  const server = new TestServer({
    command: 'npx',
    args: ['--no', packageName, ...(options?.args ?? [])],
    env: options?.env,
    waitForMessage: /ready|listening|started/i,
    timeout: options?.timeout,
  })

  await server.start()
  return server
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options?: {
    timeout?: number
    interval?: number
    message?: string
  }
): Promise<void> {
  const timeout = options?.timeout ?? 5000
  const interval = options?.interval ?? 100
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(options?.message ?? 'Timeout waiting for condition')
}
