/**
 * テスト用モックサーバーヘルパー
 * HTTP リクエストのモック化と制御
 */

import { vi, type MockedFunction } from 'vitest'

export interface MockEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS'
  path: string
  response: Response | Error
  delay?: number
  times?: number
}

export interface MockServerOptions {
  baseUrl?: string
  defaultDelay?: number
}

export class MockServer {
  private endpoints: Map<string, MockEndpoint> = new Map()
  private calls: Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string> }> = []
  private originalFetch: typeof fetch
  private baseUrl: string
  private defaultDelay: number

  constructor(options: MockServerOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:8787'
    this.defaultDelay = options.defaultDelay || 0
    this.originalFetch = global.fetch
  }

  /**
   * エンドポイントを追加
   */
  addEndpoint(endpoint: MockEndpoint): void {
    const key = `${endpoint.method}:${endpoint.path}`
    this.endpoints.set(key, { ...endpoint })
  }

  /**
   * 複数のエンドポイントを一括追加
   */
  addEndpoints(endpoints: MockEndpoint[]): void {
    for (const endpoint of endpoints) {
      this.addEndpoint(endpoint)
    }
  }

  /**
   * よく使うエンドポイントのヘルパー
   */
  get(path: string, response: Response | Error, options?: Partial<MockEndpoint>) {
    this.addEndpoint({ method: 'GET', path, response, ...options })
    return this
  }

  post(path: string, response: Response | Error, options?: Partial<MockEndpoint>) {
    this.addEndpoint({ method: 'POST', path, response, ...options })
    return this
  }

  /**
   * MCP固有のエンドポイント
   */
  mcpInitialize(response?: Partial<{ serverInfo: { name: string; version: string } }>) {
    return this.post('/mcp', new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        serverInfo: { name: 'test-server', version: '1.0.0', ...response?.serverInfo }
      }
    }), { headers: { 'content-type': 'application/json' } }))
  }

  mcpListTools(tools: Array<{ name: string; title?: string; description?: string }> = []) {
    return this.post('/mcp', new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      result: { tools }
    }), { headers: { 'content-type': 'application/json' } }))
  }

  mcpCallTool(toolName: string, result: unknown, options?: { progressNotifications?: unknown[] }) {
    const response = {
      jsonrpc: '2.0',
      id: expect.any(Number),
      result,
      ...(options?.progressNotifications && { _progressNotifications: options.progressNotifications })
    }
    
    return this.post('/mcp', new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' }
    }))
  }

  /**
   * OAuth関連のエンドポイント
   */
  oauthProtectedResource(config?: {
    authorization_servers?: string[]
    resource?: string
    scopes_supported?: string[]
  }) {
    return this.get('/.well-known/oauth-protected-resource', new Response(JSON.stringify({
      authorization_servers: ['https://auth.example.com'],
      resource: 'https://api.example.com',
      scopes_supported: ['read', 'write'],
      ...config
    }), { headers: { 'content-type': 'application/json' } }))
  }

  oauthTokenError(error: string, error_description?: string) {
    return this.post('/oauth/token', new Response(JSON.stringify({
      error,
      error_description
    }), { 
      status: 400,
      headers: { 'content-type': 'application/json' }
    }))
  }

  /**
   * エラーレスポンス
   */
  error(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, status: number, message: string) {
    return this.addEndpoint({
      method,
      path,
      response: new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: status === 400 ? -32600 : -32000,
          message
        },
        id: null
      }), {
        status,
        headers: { 'content-type': 'application/json' }
      })
    })
  }

  /**
   * ネットワークエラー
   */
  networkError(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) {
    return this.addEndpoint({
      method,
      path,
      response: new Error('Network Error')
    })
  }

  /**
   * タイムアウト
   */
  timeout(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, delay = 5000) {
    return this.addEndpoint({
      method,
      path,
      response: new Response('', { status: 200 }),
      delay
    })
  }

  /**
   * モックサーバーを開始
   */
  start(): void {
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlObj = new URL(url)
      const method = (init?.method || 'GET').toUpperCase()
      const path = urlObj.pathname + urlObj.search
      
      // リクエストを記録
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      const headers = Object.fromEntries(
        Object.entries(init?.headers || {})
      )
      
      this.calls.push({ method, path, body, headers })
      
      // エンドポイントを検索
      const key = `${method}:${path}`
      const endpoint = this.endpoints.get(key)
      
      if (!endpoint) {
        throw new Error(`No mock endpoint found for ${method} ${path}`)
      }
      
      // 遅延処理
      const delay = endpoint.delay ?? this.defaultDelay
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      // レスポンスを返す
      if (endpoint.response instanceof Error) {
        throw endpoint.response
      }
      
      // timesが設定されている場合、呼び出し回数を管理
      if (endpoint.times !== undefined) {
        endpoint.times--
        if (endpoint.times <= 0) {
          this.endpoints.delete(key)
        }
      }
      
      return endpoint.response.clone()
    }) as MockedFunction<typeof fetch>
  }

  /**
   * モックサーバーを停止
   */
  stop(): void {
    global.fetch = this.originalFetch
  }

  /**
   * リクエスト履歴を取得
   */
  getCalls(): Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string> }> {
    return [...this.calls]
  }

  /**
   * 特定のエンドポイントへの呼び出し回数を取得
   */
  getCallCount(method: string, path: string): number {
    return this.calls.filter(call => call.method === method && call.path === path).length
  }

  /**
   * リクエスト履歴をクリア
   */
  clearCalls(): void {
    this.calls = []
  }

  /**
   * 全てのエンドポイントをクリア
   */
  clearEndpoints(): void {
    this.endpoints.clear()
  }

  /**
   * モックサーバーをリセット
   */
  reset(): void {
    this.clearCalls()
    this.clearEndpoints()
  }
}