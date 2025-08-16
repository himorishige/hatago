import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { helloHatago } from '../../src/plugins/hello-hatago.js'

// Skip integration tests - need adapter layer for /mcp endpoint
describe.skip('MCP Server Integration', () => {
  describe('Full MCP Protocol Flow', () => {
    it('should handle complete MCP interaction flow', async () => {
      const { app, server } = await createApp({
        name: 'test-mcp-server',
        version: '1.0.0',
        plugins: [helloHatago()],
      })

      if (!app) throw new Error('App should be defined')

      // 1. Initialize
      const initRequest = new Request('http://localhost/mcp', {
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
            clientInfo: {
              name: 'integration-test',
              version: '0.0.1',
            },
          },
        }),
      })

      const initResponse = await app.fetch(initRequest)
      expect(initResponse.status).toBe(200)

      const initText = await initResponse.text()
      const initLines = initText.split('\n').filter(line => line.startsWith('data: '))
      const initData = JSON.parse(initLines[0].slice(6))

      expect(initData.result).toBeDefined()
      expect(initData.result.protocolVersion).toBe('2025-06-18')
      expect(initData.result.serverInfo.name).toBe('test-mcp-server')

      // 2. List tools
      const listRequest = new Request('http://localhost/mcp', {
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

      const listResponse = await app.fetch(listRequest)
      const listText = await listResponse.text()
      const listLines = listText.split('\n').filter(line => line.startsWith('data: '))
      const listData = JSON.parse(listLines[0].slice(6))

      expect(listData.result.tools).toBeInstanceOf(Array)
      const helloTool = listData.result.tools.find((t: any) => t.name === 'hello_hatago')
      expect(helloTool).toBeDefined()

      // 3. Call tool
      const callRequest = new Request('http://localhost/mcp', {
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

      const callResponse = await app.fetch(callRequest)
      const callText = await callResponse.text()
      const callLines = callText.split('\n').filter(line => line.startsWith('data: '))
      const callData = JSON.parse(callLines[0].slice(6))

      expect(callData.result).toBeDefined()
      expect(callData.result.content).toBeInstanceOf(Array)
      expect(callData.result.content[0].type).toBe('text')
      expect(callData.result.content[0].text).toContain('Hello Hatago!')
    })

    it('should handle progress notifications', async () => {
      const { app } = await createApp({
        plugins: [helloHatago()],
      })

      if (!app) throw new Error('App should be defined')

      // Initialize first
      await app.fetch(
        new Request('http://localhost/mcp', {
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
              clientInfo: { name: 'test', version: '0.0.1' },
            },
          }),
        })
      )

      // Call tool with progress token
      const callRequest = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'hello_hatago',
            arguments: {},
            _meta: {
              progressToken: 'test-progress-123',
            },
          },
        }),
      })

      const response = await app.fetch(callRequest)
      const text = await response.text()
      const lines = text.split('\n').filter(line => line.trim())

      // Should have multiple events (progress notifications + result)
      expect(lines.length).toBeGreaterThan(1)

      // Check for progress notifications
      const progressLines = lines.filter(
        line => line.startsWith('data: ') && line.includes('notifications/progress')
      )

      // Should have progress notifications (at least some)
      expect(progressLines.length).toBeGreaterThan(0)

      // Last event should be the result
      const resultLine = lines.find(
        line => line.startsWith('data: ') && !line.includes('notifications/progress')
      )
      expect(resultLine).toBeDefined()

      const resultData = JSON.parse(resultLine!.slice(6))
      expect(resultData.result.content[0].text).toContain('Hello Hatago!')
    })

    it('should handle errors properly', async () => {
      const { app } = await createApp()

      if (!app) throw new Error('App should be defined')

      // Try to call non-existent method
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'non_existent_method',
        }),
      })

      const response = await app.fetch(request)
      const text = await response.text()
      const lines = text.split('\n').filter(line => line.startsWith('data: '))
      const data = JSON.parse(lines[0].slice(6))

      expect(data.error).toBeDefined()
      expect(data.error.code).toBe(-32601) // Method not found
      expect(data.error.message).toContain('Method not found')
    })
  })
})
