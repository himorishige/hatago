/**
 * テスト用共通ユーティリティ
 */

import type { HatagoContext } from '@hatago/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono } from 'hono'
import { type MockedFunction, vi } from 'vitest'

/**
 * モックコンテキストの作成
 */
export function createMockContext(overrides: Partial<HatagoContext> = {}): HatagoContext {
  return {
    app: null,
    server: new McpServer({ name: 'test-server', version: '1.0.0' }),
    env: { NODE_ENV: 'test' },
    getBaseUrl: (req: Request) => new URL(req.url),
    mode: 'http',
    ...overrides,
  }
}

/**
 * テスト用のMCP Serverを作成
 */
export function createTestMcpServer(name = 'test-server', version = '1.0.0'): McpServer {
  return new McpServer({ name, version })
}

/**
 * テスト用の一時ディレクトリを作成
 */
export function createTempDir(): string {
  const tmpDir = `/tmp/hatago-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  return tmpDir
}

/**
 * テスト用の設定ファイルパスを生成
 */
export function createTestConfigPath(): string {
  return `${createTempDir()}/hatago.config.json`
}

/**
 * 非同期関数のタイムアウト待機
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 関数が特定の条件を満たすまで待機
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return
    }
    await waitFor(interval)
  }

  throw new Error(`Condition not met within ${timeout}ms`)
}

/**
 * エラーが投げられることを検証するヘルパー
 */
export async function expectThrowsAsync<T extends Error>(
  fn: () => Promise<unknown>,
  errorClass?: new (...args: unknown[]) => T
): Promise<T> {
  try {
    await fn()
    throw new Error('Expected function to throw, but it did not')
  } catch (error) {
    if (errorClass && !(error instanceof errorClass)) {
      throw new Error(
        `Expected error of type ${errorClass.name}, but got ${error.constructor.name}`
      )
    }
    return error as T
  }
}

/**
 * コンソール出力をキャプチャするヘルパー
 */
export function captureConsole() {
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn

  const logs: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  console.log = vi.fn((...args) => logs.push(args.join(' ')))
  console.error = vi.fn((...args) => errors.push(args.join(' ')))
  console.warn = vi.fn((...args) => warnings.push(args.join(' ')))

  return {
    logs,
    errors,
    warnings,
    restore: () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    },
  }
}

/**
 * 環境変数をモックするヘルパー
 */
export function mockEnv(envVars: Record<string, string | undefined>) {
  const originalEnv = { ...process.env }

  // 環境変数を設定
  for (const [key, value] of Object.entries(envVars)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return {
    restore: () => {
      // 元の環境変数を復元
      process.env = originalEnv
    },
  }
}

/**
 * fetchをモックするヘルパー
 */
export function mockFetch(responses: Array<{ url?: string; response: Response | Error }>) {
  const originalFetch = global.fetch
  let callIndex = 0

  global.fetch = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const urlString = url.toString()

    // URLマッチングまたは順次実行
    for (const mock of responses) {
      if (!mock.url || urlString.includes(mock.url)) {
        if (mock.response instanceof Error) {
          throw mock.response
        }
        return mock.response
      }
    }

    // フォールバック：順次実行
    if (callIndex < responses.length) {
      const mock = responses[callIndex++]
      if (mock.response instanceof Error) {
        throw mock.response
      }
      return mock.response
    }

    throw new Error(`Unexpected fetch call: ${urlString}`)
  }) as MockedFunction<typeof fetch>

  return {
    restore: () => {
      global.fetch = originalFetch
    },
  }
}

/**
 * テスト用のHTTPレスポンスを作成
 */
export function createMockResponse(data: unknown, options: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...options,
  })
}

/**
 * テスト用のストリーミングレスポンスを作成
 */
export function createMockStreamResponse(events: Array<{ event?: string; data: unknown }>) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        const eventLine = event.event ? `event: ${event.event}\n` : ''
        const dataLine = `data: ${JSON.stringify(event.data)}\n\n`
        const chunk = encoder.encode(eventLine + dataLine)
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

/**
 * テスト用のエラーレスポンスを作成
 */
export function createMockErrorResponse(code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code,
        message,
      },
      id: null,
    }),
    {
      status: code >= 400 && code < 500 ? code : 500,
      headers: { 'content-type': 'application/json' },
    }
  )
}
