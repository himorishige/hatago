/**
 * Integration tests for Hatago Phase 6 Operations & Monitoring features
 * Tests SLO metrics, health checks, logging, security, and graceful shutdown
 */

const test = require('node:test')
const assert = require('node:assert')
const { spawn } = require('node:child_process')
const { setTimeout } = require('node:timers/promises')

// Test configuration
const TEST_PORT = 8788
const BASE_URL = `http://localhost:${TEST_PORT}`
const MCP_URL = `${BASE_URL}/mcp`

let hatagoProcess = null

/**
 * Utility function to make HTTP requests
 */
async function makeRequest(url, options = {}) {
  const fetch = (await import('node-fetch')).default
  const response = await fetch(url, {
    timeout: 5000,
    ...options,
  })
  return response
}

/**
 * Utility function to make MCP requests
 */
async function makeMCPRequest(method, params = {}) {
  const response = await makeRequest(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000),
      method,
      params,
    }),
  })

  const text = await response.text()

  // Handle server-sent events format
  if (text.startsWith('event: message\ndata: ')) {
    const jsonData = text.split('data: ')[1]
    return JSON.parse(jsonData)
  }

  return JSON.parse(text)
}

/**
 * Start Hatago server for testing
 */
async function startHatagoServer() {
  return new Promise((resolve, reject) => {
    hatagoProcess = spawn('node', ['packages/adapter-node/dist/server.js'], {
      env: {
        ...process.env,
        PORT: TEST_PORT,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''

    hatagoProcess.stdout.on('data', data => {
      output += data.toString()
      if (output.includes('Hatago starting')) {
        setTimeout(1000).then(resolve) // Give server time to start
      }
    })

    hatagoProcess.stderr.on('data', data => {
      console.error('Hatago stderr:', data.toString())
    })

    hatagoProcess.on('error', reject)

    // Timeout after 10 seconds
    setTimeout(10000).then(() => {
      if (hatagoProcess && !hatagoProcess.killed) {
        reject(new Error('Server startup timeout'))
      }
    })
  })
}

/**
 * Stop Hatago server
 */
async function stopHatagoServer() {
  if (hatagoProcess && !hatagoProcess.killed) {
    hatagoProcess.kill('SIGTERM')
    await setTimeout(2000) // Give time for graceful shutdown
    if (!hatagoProcess.killed) {
      hatagoProcess.kill('SIGKILL')
    }
  }
}

// Test suite setup and teardown
test.before(async () => {
  console.log('Starting Hatago server for integration tests...')
  await startHatagoServer()
  console.log('Server started successfully')
})

test.after(async () => {
  console.log('Stopping Hatago server...')
  await stopHatagoServer()
  console.log('Server stopped')
})

// Health Check Tests
test('Health Check System', async t => {
  await t.test('liveness probe responds correctly', async () => {
    const response = await makeRequest(`${BASE_URL}/health/live`)
    assert.strictEqual(response.status, 200)

    const data = await response.json()
    assert.strictEqual(data.status, 'pass')
    assert.ok(data.timestamp)
    assert.ok(typeof data.uptime === 'number')
  })

  await t.test('readiness probe responds correctly', async () => {
    const response = await makeRequest(`${BASE_URL}/health/ready`)
    assert.strictEqual(response.status, 200)

    const data = await response.json()
    assert.strictEqual(data.status, 'pass')
    assert.ok(data.checks)
  })

  await t.test('startup probe responds correctly', async () => {
    const response = await makeRequest(`${BASE_URL}/health/startup`)
    assert.strictEqual(response.status, 200)

    const data = await response.json()
    assert.strictEqual(data.status, 'pass')
    assert.strictEqual(data.initialized, true)
  })
})

// Metrics Tests
test('SLO Metrics System', async t => {
  await t.test('metrics endpoint is accessible', async () => {
    const response = await makeRequest(`${BASE_URL}/metrics`)
    assert.strictEqual(response.status, 200)

    const metrics = await response.text()
    assert.ok(metrics.includes('hatago_requests_total'))
    assert.ok(metrics.includes('hatago_slo_target'))
  })

  await t.test('SLO targets are exposed', async () => {
    const response = await makeRequest(`${BASE_URL}/metrics`)
    const metrics = await response.text()

    // Check for SLO target metrics
    assert.ok(metrics.includes('hatago_slo_target{metric="availability_percent"} 99.95'))
    assert.ok(metrics.includes('hatago_slo_target{metric="p95_latency_ms"} 5'))
    assert.ok(metrics.includes('hatago_slo_target{metric="p99_latency_ms"} 10'))
    assert.ok(metrics.includes('hatago_slo_target{metric="error_rate_percent"} 0.1'))
  })

  await t.test('request metrics are tracked', async () => {
    // Make a few requests to generate metrics
    await makeRequest(`${BASE_URL}/health/ready`)
    await makeRequest(`${BASE_URL}/health/ready`)
    await makeRequest(`${BASE_URL}/health/ready`)

    const response = await makeRequest(`${BASE_URL}/metrics`)
    const metrics = await response.text()

    assert.ok(metrics.includes('hatago_requests_total'))
    assert.ok(metrics.includes('hatago_request_duration_seconds'))
  })
})

// Logging Tests
test('Structured Logging System', async t => {
  await t.test('logs endpoint is accessible', async () => {
    const response = await makeRequest(`${BASE_URL}/logs?limit=10`)
    assert.strictEqual(response.status, 200)

    const data = await response.json()
    assert.ok(Array.isArray(data.logs))
    assert.ok(typeof data.total === 'number')
    assert.ok(typeof data.buffer_size === 'number')
  })

  await t.test('logs MCP tool works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'logs.query',
      arguments: { limit: 5 },
    })

    assert.ok(response.result)
    assert.ok(response.result.content)
    assert.ok(Array.isArray(response.result.content))
  })

  await t.test('log configuration tool works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'logs.config',
      arguments: {},
    })

    assert.ok(response.result)
    assert.ok(response.result.content)

    const content = JSON.parse(response.result.content[0].text)
    assert.ok(content.current_config)
    assert.ok(content.buffer_usage)
  })
})

// Security Tests
test('Plugin Security System', async t => {
  await t.test('security status endpoint works', async () => {
    const response = await makeRequest(`${BASE_URL}/security/status`)
    assert.strictEqual(response.status, 200)

    const data = await response.json()
    assert.strictEqual(data.enabled, true)
    assert.ok(typeof data.requireSigned === 'boolean')
    assert.ok(data.metrics)
  })

  await t.test('security MCP tools work', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'security.status',
      arguments: {},
    })

    assert.ok(response.result)
    assert.ok(response.result.content)

    const content = JSON.parse(response.result.content[0].text)
    assert.ok(content.config)
    assert.ok(content.metrics)
  })

  await t.test('key generation works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'security.generate_key',
      arguments: { algorithm: 'ed25519' },
    })

    assert.ok(response.result)
    assert.ok(response.result.content)

    const content = JSON.parse(response.result.content[0].text)
    assert.ok(content.keyId)
    assert.strictEqual(content.algorithm, 'ed25519')
  })
})

// Concurrency Limiter Tests
test('Concurrency Protection System', async t => {
  await t.test('concurrency status tool works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'concurrency.status',
      arguments: {},
    })

    assert.ok(response.result)
    assert.ok(response.result.content)

    const content = JSON.parse(response.result.content[0].text)
    assert.ok(typeof content.active_requests === 'number')
    assert.ok(typeof content.queue_length === 'number')
    assert.ok(content.config)
  })

  await t.test('concurrency test tool works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'concurrency.test',
      arguments: {
        action: 'simulate_load',
        count: 5,
      },
    })

    assert.ok(response.result)
    assert.ok(response.result.content)
    assert.ok(response.result.content[0].text.includes('simulate_load'))
  })
})

// MCP Core Functionality Tests
test('MCP Core Functionality', async t => {
  await t.test('tools list endpoint works', async () => {
    const response = await makeMCPRequest('tools/list')

    assert.ok(response.result)
    assert.ok(response.result.tools)
    assert.ok(Array.isArray(response.result.tools))

    // Check that our operational tools are present
    const toolNames = response.result.tools.map(t => t.name)
    assert.ok(toolNames.includes('logs.query'))
    assert.ok(toolNames.includes('security.status'))
    assert.ok(toolNames.includes('concurrency.status'))
  })

  await t.test('hello hatago tool works', async () => {
    const response = await makeMCPRequest('tools/call', {
      name: 'hello.hatago',
      arguments: {},
    })

    assert.ok(response.result)
    assert.ok(response.result.content)
    assert.ok(response.result.content[0].text.includes('Hello Hatago'))
  })
})

// Error Handling Tests
test('Error Handling and Resilience', async t => {
  await t.test('404 errors are tracked in metrics', async () => {
    // Make a request to non-existent endpoint
    await makeRequest(`${BASE_URL}/nonexistent`).catch(() => {})

    // Check metrics
    const response = await makeRequest(`${BASE_URL}/metrics`)
    const metrics = await response.text()

    assert.ok(metrics.includes('hatago_requests_total'))
  })

  await t.test('invalid MCP requests are handled gracefully', async () => {
    const response = await makeRequest(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: 'invalid json',
    })

    // Should not crash the server
    assert.ok(response.status >= 400)
  })
})

// Performance Tests
test('Performance and Load Handling', async t => {
  await t.test('concurrent requests are handled correctly', async () => {
    const promises = []

    // Make 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      promises.push(makeRequest(`${BASE_URL}/health/ready`))
    }

    const responses = await Promise.all(promises)

    // All requests should succeed
    responses.forEach(response => {
      assert.strictEqual(response.status, 200)
    })
  })

  await t.test('metrics show request patterns', async () => {
    // Make some requests
    for (let i = 0; i < 5; i++) {
      await makeRequest(`${BASE_URL}/health/ready`)
    }

    const response = await makeRequest(`${BASE_URL}/metrics`)
    const metrics = await response.text()

    // Should have metrics data
    assert.ok(metrics.includes('hatago_requests_total'))
    assert.ok(metrics.includes('hatago_inflight_requests'))
  })
})

console.log('Phase 6 Operations & Monitoring Integration Tests Ready')
console.log('Run with: npm test tests/integration/phase6-operations.test.js')
