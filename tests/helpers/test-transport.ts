/**
 * Transport層のテスト用ヘルパー
 * StreamableHTTPTransportの動作をテストするためのユーティリティ
 */

import { vi } from 'vitest'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from 'hono'

/**
 * テスト用のSSEストリーミングAPIモック
 */
export class MockSSEStreamingApi {
  public closed = false
  public events: Array<{ id?: string; event?: string; data: string }> = []
  private abortHandlers: Array<() => void> = []

  async writeSSE(event: { id?: string; event?: string; data: string }): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed')
    }
    this.events.push({ ...event })
  }

  onAbort(handler: () => void): void {
    this.abortHandlers.push(handler)
  }

  close(): void {
    this.closed = true
    this.abortHandlers.forEach(handler => handler())
  }

  abort(): void {
    this.close()
  }

  getLastEvent(): { id?: string; event?: string; data: string } | undefined {
    return this.events[this.events.length - 1]
  }

  getEventsByType(eventType: string): Array<{ id?: string; event?: string; data: string }> {
    return this.events.filter(event => event.event === eventType)
  }

  getDataAsJson(): unknown[] {
    return this.events.map(event => {
      try {
        return JSON.parse(event.data)
      } catch {
        return event.data
      }
    })
  }
}

/**
 * テスト用のHono Contextモック
 */
export function createMockContext(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}): Context {
  const { method = 'GET', url = 'http://localhost:8787/test', headers = {}, body } = options

  const request = new Request(url, {
    method,
    headers,
    body: body ? body : undefined,
  })

  const responseHeaders: Record<string, string> = {}
  
  return {
    req: {
      method,
      url,
      header: (name?: string) => {
        if (name) {
          return headers[name.toLowerCase()]
        }
        return headers
      },
      text: async () => body || '',
      json: async () => body ? JSON.parse(body) : {},
      raw: request,
    },
    header: (name: string, value: string) => {
      responseHeaders[name] = value
    },
    json: vi.fn((data: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: { 'content-type': 'application/json', ...responseHeaders, ...init?.headers },
      })
    }),
    body: vi.fn((data: BodyInit | null, init?: ResponseInit) => {
      return new Response(data, {
        ...init,
        headers: { ...responseHeaders, ...init?.headers },
      })
    }),
    get: vi.fn((key: string) => {
      // Context storage mock
      const storage: Record<string, unknown> = {}
      return storage[key]
    }),
    set: vi.fn((key: string, value: unknown) => {
      // Context storage mock
      const storage: Record<string, unknown> = {}
      storage[key] = value
    }),
  } as unknown as Context
}

/**
 * テスト用のJSON-RPCメッセージファクトリー
 */
export class JSONRPCMessageFactory {
  private static idCounter = 1

  static createRequest(method: string, params?: unknown, id?: string | number): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id: id ?? this.idCounter++,
      method,
      params,
    }
  }

  static createResponse(id: string | number, result: unknown): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id,
      result,
    }
  }

  static createError(id: string | number | null, code: number, message: string, data?: unknown): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    }
  }

  static createNotification(method: string, params?: unknown): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      method,
      params,
    }
  }

  static createInitializeRequest(clientName = 'test-client', clientVersion = '1.0.0'): JSONRPCMessage {
    return this.createRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    })
  }

  static createInitializeResponse(id: string | number, serverName = 'test-server', serverVersion = '1.0.0'): JSONRPCMessage {
    return this.createResponse(id, {
      protocolVersion: '2025-06-18',
      capabilities: {},
      serverInfo: { name: serverName, version: serverVersion },
    })
  }

  static createToolsListRequest(): JSONRPCMessage {
    return this.createRequest('tools/list')
  }

  static createToolsListResponse(id: string | number, tools: Array<{ name: string; title?: string; description?: string }>): JSONRPCMessage {
    return this.createResponse(id, { tools })
  }

  static createToolCallRequest(toolName: string, args: unknown, meta?: unknown): JSONRPCMessage {
    return this.createRequest('tools/call', {
      name: toolName,
      arguments: args,
      ...(meta && { _meta: meta }),
    })
  }

  static createToolCallResponse(id: string | number, result: unknown): JSONRPCMessage {
    return this.createResponse(id, result)
  }

  static createProgressNotification(progressToken: string, progress: number, total?: number): JSONRPCMessage {
    return this.createNotification('notifications/progress', {
      progressToken,
      progress,
      total,
    })
  }
}

/**
 * ストリーミングテスト用のヘルパー
 */
export class StreamingTestHelper {
  /**
   * SSEストリームからメッセージを収集
   */
  static async collectSSEMessages(stream: ReadableStream<Uint8Array>, timeout = 1000): Promise<JSONRPCMessage[]> {
    const messages: JSONRPCMessage[] = []
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Stream timeout')), timeout)
    })

    try {
      while (true) {
        const result = await Promise.race([
          reader.read(),
          timeoutPromise.then(() => ({ done: true, value: undefined }))
        ])

        if (result.done) break

        const chunk = decoder.decode(result.value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              messages.push(data)
            } catch {
              // Invalid JSON in SSE stream - ignore
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return messages
  }

  /**
   * ストリーミングレスポンスのシミュレーション
   */
  static createStreamingResponse(messages: JSONRPCMessage[]): Response {
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      start(controller) {
        for (const message of messages) {
          const data = `data: ${JSON.stringify(message)}\n\n`
          controller.enqueue(encoder.encode(data))
        }
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    })
  }

  /**
   * ネットワーク遅延のシミュレーション
   */
  static async simulateNetworkDelay(minMs = 10, maxMs = 100): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * 接続中断のシミュレーション
   */
  static createAbortedResponse(): Response {
    const controller = new AbortController()
    const stream = new ReadableStream({
      start() {
        // Immediately abort
        controller.abort()
      }
    })

    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
}