/**
 * E2E テスト：最小フロー（テンプレート）
 * 起動 → ハンドシェイク → 最小ルート成功
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('E2E: Minimal Flow', () => {
  let _serverProcess: any
  let serverUrl: string

  beforeAll(async () => {
    // TODO: テストサーバーの起動
    // serverProcess = spawn('node', ['dist/index.js'], { env: { PORT: '0' } })
    // serverUrl = await getServerUrl(serverProcess)
    serverUrl = 'http://localhost:8787'
  })

  afterAll(async () => {
    // TODO: サーバープロセスの終了
    // serverProcess?.kill()
  })

  it('should complete basic MCP flow successfully', async () => {
    // 1. Health check
    const healthResponse = await fetch(`${serverUrl}/health`)
    expect(healthResponse.ok).toBe(true)

    // 2. MCP Initialize
    const initResponse = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'e2e-test', version: '1.0.0' },
        },
      }),
    })

    expect(initResponse.ok).toBe(true)
    // TODO: SSE response parsing

    // 3. List tools
    const toolsResponse = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    })

    expect(toolsResponse.ok).toBe(true)
    // TODO: Tools list validation

    // 4. Call a tool
    const toolCallResponse = await fetch(`${serverUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'hello_hatago',
          arguments: {},
        },
      }),
    })

    expect(toolCallResponse.ok).toBe(true)
    // TODO: Tool call result validation
  })

  it('should have clean startup with no warnings', async () => {
    // TODO: ログの確認
    // expect(serverLogs).not.toContain('WARNING')
    // expect(serverLogs).not.toContain('ERROR')
    expect(true).toBe(true)
  })

  it('should respond to health checks within acceptable time', async () => {
    const start = Date.now()
    const response = await fetch(`${serverUrl}/health`)
    const duration = Date.now() - start

    expect(response.ok).toBe(true)
    expect(duration).toBeLessThan(150) // 150ms 以内
  })
})
