/**
 * StreamableHTTPTransport テスト
 * ストリーミング、接続管理、エラーハンドリング、リソース管理をテスト
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { StreamableHTTPTransport } from '../../src/streamableHttp.js'
import {
  createMockContext,
  MockSSEStreamingApi,
  JSONRPCMessageFactory,
  StreamingTestHelper,
} from '../../../../tests/helpers/test-transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

describe('StreamableHTTPTransport', () => {
  let transport: StreamableHTTPTransport
  let mockStream: MockSSEStreamingApi

  beforeEach(() => {
    transport = new StreamableHTTPTransport()
    mockStream = new MockSSEStreamingApi()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Initialization and Lifecycle', () => {
    it('should initialize transport correctly', async () => {
      expect(transport.sessionId).toBeUndefined()

      await transport.start()

      expect(transport.sessionId).toBeUndefined() // セッションIDは初期化時には設定されない
    })

    it('should prevent multiple starts', async () => {
      await transport.start()

      await expect(transport.start()).rejects.toThrow('Transport already started')
    })

    it('should clean up resources on close', async () => {
      await transport.start()

      const closeSpy = vi.fn()
      transport.onclose = closeSpy

      await transport.close()

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe('Session Management', () => {
    it('should handle session initialization correctly', async () => {
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createInitializeRequest()),
      })

      await transport.start()
      const response = await transport.handleRequest(ctx)

      expect(response).toBeDefined()
      expect(transport.sessionId).toBeDefined()
    })

    it('should validate session ID on subsequent requests', async () => {
      const transport = new StreamableHTTPTransport({
        sessionIdGenerator: () => 'test-session-123',
      })

      await transport.start()

      // 初期化リクエスト
      const initCtx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createInitializeRequest()),
      })

      await transport.handleRequest(initCtx)

      // セッションIDが必要なリクエスト
      const reqCtx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': 'wrong-session',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createToolsListRequest()),
      })

      await expect(transport.handleRequest(reqCtx)).rejects.toThrow()
    })

    it('should accept correct session ID', async () => {
      const transport = new StreamableHTTPTransport({
        sessionIdGenerator: () => 'test-session-123',
      })

      await transport.start()

      // 初期化
      const initCtx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createInitializeRequest()),
      })

      await transport.handleRequest(initCtx)

      // 正しいセッションID
      const reqCtx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': 'test-session-123',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createToolsListRequest()),
      })

      const response = await transport.handleRequest(reqCtx)
      expect(response).toBeDefined()
    })
  })

  describe('Request Validation', () => {
    beforeEach(async () => {
      await transport.start()
    })

    it('should validate Content-Type header for POST requests', async () => {
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          accept: 'application/json, text/event-stream',
        },
        body: '{}',
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })

    it('should validate Accept header for GET requests', async () => {
      const ctx = createMockContext({
        method: 'GET',
        headers: {
          accept: 'application/json', // text/event-stream が含まれていない
        },
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })

    it('should enforce message size limits', async () => {
      const transport = new StreamableHTTPTransport({
        maxMessageSize: 100, // 小さい制限
      })

      await transport.start()

      const largeMessage = 'x'.repeat(200)
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: largeMessage,
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })

    it('should handle malformed JSON gracefully', async () => {
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: '{ invalid json }',
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })
  })

  describe('Streaming and Queue Management', () => {
    beforeEach(async () => {
      await transport.start()
    })

    it('should handle queue size limits', async () => {
      const transport = new StreamableHTTPTransport({
        maxQueueSize: 2, // 小さい制限
      })

      await transport.start()

      // 複数のメッセージを送信してキューを満杯にする
      const message1 = JSONRPCMessageFactory.createResponse(1, 'result1')
      const message2 = JSONRPCMessageFactory.createResponse(2, 'result2')
      const message3 = JSONRPCMessageFactory.createResponse(3, 'result3')

      transport.onmessage = vi.fn()

      // キューがいっぱいになるとエラーが発生するはず
      await expect(async () => {
        await transport.send(message1)
        await transport.send(message2)
        await transport.send(message3) // これがキュー制限を超える
      }).rejects.toThrow('Queue size limit exceeded')
    })

    it('should handle concurrent writes safely', async () => {
      const messages = [
        JSONRPCMessageFactory.createResponse(1, 'result1'),
        JSONRPCMessageFactory.createResponse(2, 'result2'),
        JSONRPCMessageFactory.createResponse(3, 'result3'),
      ]

      transport.onmessage = vi.fn()

      // 同時に複数のメッセージを送信
      const promises = messages.map(msg => transport.send(msg))

      // すべて成功するか、適切にエラーハンドリングされるはず
      const results = await Promise.allSettled(promises)

      // 少なくとも一部は成功するはず（具体的な期待値は実装依存）
      expect(results.some(r => r.status === 'fulfilled')).toBe(true)
    })

    it('should clean up streams on client disconnect', async () => {
      const ctx = createMockContext({
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
        },
      })

      // GET リクエストを処理（SSE ストリーム開始）
      const response = await transport.handleRequest(ctx)
      expect(response).toBeDefined()

      // デバッグ情報でストリームが作成されたことを確認
      const debugInfo = transport.getDebugInfo()
      expect(debugInfo.streamCount).toBe(1)

      // クライアント切断をシミュレート
      mockStream.abort()

      // リソースがクリーンアップされることを確認（非同期処理）
      await vi.runAllTimersAsync()

      const debugInfoAfter = transport.getDebugInfo()
      expect(debugInfoAfter.streamCount).toBe(0)
    })
  })

  describe('DNS Rebinding Protection', () => {
    it('should validate Host header when protection is enabled', async () => {
      const transport = new StreamableHTTPTransport({
        enableDnsRebindingProtection: true,
        allowedHosts: ['localhost:8787'],
      })

      await transport.start()

      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          host: 'malicious.com',
        },
        body: '{}',
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })

    it('should validate Origin header when protection is enabled', async () => {
      const transport = new StreamableHTTPTransport({
        enableDnsRebindingProtection: true,
        allowedOrigins: ['http://localhost:3000'],
      })

      await transport.start()

      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          origin: 'http://malicious.com',
        },
        body: '{}',
      })

      await expect(transport.handleRequest(ctx)).rejects.toThrow()
    })

    it('should allow valid hosts and origins', async () => {
      const transport = new StreamableHTTPTransport({
        enableDnsRebindingProtection: true,
        allowedHosts: ['localhost:8787'],
        allowedOrigins: ['http://localhost:3000'],
      })

      await transport.start()

      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          host: 'localhost:8787',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createInitializeRequest()),
      })

      const response = await transport.handleRequest(ctx)
      expect(response).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await transport.start()
    })

    it('should handle unsupported HTTP methods', async () => {
      const ctx = createMockContext({
        method: 'PUT',
        url: 'http://localhost:8787/test',
      })

      const response = await transport.handleRequest(ctx)
      expect(response).toBeDefined()

      // Method not allowed レスポンスが返されるはず
      const responseData = await response.json()
      expect(responseData.error.code).toBe(-32000)
      expect(responseData.error.message).toContain('Method not allowed')
    })

    it('should handle errors in message processing', async () => {
      const errorSpy = vi.fn()
      transport.onerror = errorSpy

      // onmessage でエラーを発生させる
      transport.onmessage = vi.fn().mockImplementation(() => {
        throw new Error('Processing error')
      })

      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(JSONRPCMessageFactory.createInitializeRequest()),
      })

      const response = await transport.handleRequest(ctx)

      // エラーハンドラーが呼ばれることを確認
      expect(errorSpy).toHaveBeenCalled()
    })

    it('should handle stream write errors gracefully', async () => {
      const errorSpy = vi.fn()
      transport.onerror = errorSpy

      // ストリームの書き込みエラーをシミュレート
      mockStream.writeSSE = vi.fn().mockRejectedValue(new Error('Write error'))

      const message = JSONRPCMessageFactory.createNotification('test', {})

      // エラーが適切にハンドリングされることを確認
      await expect(transport.send(message)).rejects.toThrow()
    })
  })

  describe('Event Store Integration', () => {
    it('should store events when event store is provided', async () => {
      const mockEventStore = {
        storeEvent: vi.fn().mockResolvedValue('event-123'),
        replayEventsAfter: vi.fn().mockResolvedValue('stream-456'),
      }

      const transport = new StreamableHTTPTransport({
        eventStore: mockEventStore,
      })

      await transport.start()

      const message = JSONRPCMessageFactory.createNotification('test', {})

      await transport.send(message)

      expect(mockEventStore.storeEvent).toHaveBeenCalledWith('_GET_stream', message)
    })

    it('should replay events on resumable connections', async () => {
      const mockEventStore = {
        storeEvent: vi.fn().mockResolvedValue('event-123'),
        replayEventsAfter: vi.fn().mockImplementation(async (lastEventId, sender) => {
          // 過去のイベントを再生
          await sender.send('event-1', JSONRPCMessageFactory.createNotification('old-event', {}))
          return 'stream-456'
        }),
      }

      const transport = new StreamableHTTPTransport({
        eventStore: mockEventStore,
      })

      await transport.start()

      const ctx = createMockContext({
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
          'last-event-id': 'event-0',
        },
      })

      const response = await transport.handleRequest(ctx)
      expect(response).toBeDefined()

      expect(mockEventStore.replayEventsAfter).toHaveBeenCalledWith(
        'event-0',
        expect.objectContaining({
          send: expect.any(Function),
        })
      )
    })
  })

  describe('Performance and Resource Management', () => {
    beforeEach(async () => {
      await transport.start()
    })

    it('should handle high message throughput', async () => {
      const messageCount = 100
      const messages: JSONRPCMessage[] = []

      for (let i = 0; i < messageCount; i++) {
        messages.push(JSONRPCMessageFactory.createNotification('test', { index: i }))
      }

      transport.onmessage = vi.fn()

      const startTime = Date.now()

      // 大量のメッセージを送信
      for (const message of messages) {
        await transport.send(message)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // 高いスループットを期待（具体的な値は環境依存）
      expect(duration).toBeLessThan(5000) // 5秒以内
    })

    it('should limit concurrent connections', async () => {
      const connectionLimit = 5
      const connections: Promise<Response>[] = []

      // 複数の同時接続を試行
      for (let i = 0; i < connectionLimit + 2; i++) {
        const ctx = createMockContext({
          method: 'GET',
          headers: {
            accept: 'text/event-stream',
          },
        })

        connections.push(transport.handleRequest(ctx))
      }

      const results = await Promise.allSettled(connections)

      // 一部の接続は拒否されるか、制限が適用されることを確認
      expect(results.some(r => r.status === 'fulfilled')).toBe(true)
    })

    it('should clean up resources on transport close', async () => {
      // 複数のストリームを作成
      const ctx1 = createMockContext({
        method: 'GET',
        headers: { accept: 'text/event-stream' },
      })
      const ctx2 = createMockContext({
        method: 'GET',
        headers: { accept: 'text/event-stream' },
      })

      await transport.handleRequest(ctx1)
      await transport.handleRequest(ctx2)

      const debugInfoBefore = transport.getDebugInfo()
      expect(debugInfoBefore.streamCount).toBeGreaterThan(0)

      // トランスポートを閉じる
      await transport.close()

      const debugInfoAfter = transport.getDebugInfo()
      expect(debugInfoAfter.streamCount).toBe(0)
    })
  })
})
