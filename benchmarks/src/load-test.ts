#!/usr/bin/env tsx

/**
 * Load testing for Hatago endpoints
 * Uses Node.js built-in HTTP client for load generation
 */

import { performance } from 'node:perf_hooks'
import { createApp } from '@hatago/adapter-node'
import { serve } from '@hono/node-server'

interface LoadTestConfig {
  url: string
  concurrency: number
  duration: number // seconds
  rampUp?: number // seconds
}

interface LoadTestResult {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  duration: number
  rps: number
  avgLatency: number
  p95Latency: number
  errors: Record<string, number>
}

async function makeRequest(
  url: string
): Promise<{ success: boolean; latency: number; error?: string }> {
  const start = performance.now()

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    const latency = performance.now() - start

    if (response.ok) {
      await response.text() // Consume body
      return { success: true, latency }
    } else {
      return { success: false, latency, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    const latency = performance.now() - start
    return {
      success: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  console.log(`🏃 Load test: ${config.url}`)
  console.log(`   Concurrency: ${config.concurrency}`)
  console.log(`   Duration: ${config.duration}s`)

  const results: Array<{ success: boolean; latency: number; error?: string }> = []
  const errors: Record<string, number> = {}
  const startTime = performance.now()
  const endTime = startTime + config.duration * 1000

  let activeRequests = 0
  let finished = false

  // Worker function
  const worker = async () => {
    while (!finished && performance.now() < endTime) {
      if (activeRequests < config.concurrency) {
        activeRequests++

        makeRequest(config.url)
          .then(result => {
            results.push(result)
            if (!result.success && result.error) {
              errors[result.error] = (errors[result.error] || 0) + 1
            }
          })
          .finally(() => {
            activeRequests--
          })

        // Small delay to control rate
        await new Promise(resolve => setTimeout(resolve, 1))
      } else {
        // Wait a bit if at max concurrency
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
  }

  // Start workers
  const workers = Array(Math.min(config.concurrency, 10))
    .fill(0)
    .map(() => worker())

  // Wait for duration
  await new Promise(resolve => setTimeout(resolve, config.duration * 1000))
  finished = true

  // Wait for workers to finish
  await Promise.all(workers)

  // Wait for remaining requests
  while (activeRequests > 0) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const actualDuration = (performance.now() - startTime) / 1000
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const latencies = results.map(r => r.latency).sort((a, b) => a - b)

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    duration: actualDuration,
    rps: results.length / actualDuration,
    avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
    p95Latency: latencies[Math.floor(latencies.length * 0.95)] || 0,
    errors,
  }
}

async function runAllLoadTests() {
  console.log('🔥 Hatago Load Tests')
  console.log('='.repeat(50))

  // Start server
  const { app } = await createApp({
    name: 'hatago-load-test',
    version: '0.1.0',
  })

  const server = serve({
    fetch: app.fetch,
    port: 8788,
  })

  console.log('📡 Test server started on http://localhost:8788')

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    const tests: Array<{ name: string; config: LoadTestConfig }> = [
      {
        name: 'Health Endpoint (Light)',
        config: {
          url: 'http://localhost:8788/health',
          concurrency: 10,
          duration: 10,
        },
      },
      {
        name: 'Health Endpoint (Heavy)',
        config: {
          url: 'http://localhost:8788/health',
          concurrency: 50,
          duration: 10,
        },
      },
      {
        name: 'Metrics JSON (Medium)',
        config: {
          url: 'http://localhost:8788/metrics.json',
          concurrency: 25,
          duration: 10,
        },
      },
      {
        name: 'Readiness Check',
        config: {
          url: 'http://localhost:8788/readyz',
          concurrency: 20,
          duration: 10,
        },
      },
    ]

    const results: Array<{ name: string; result: LoadTestResult }> = []

    for (const test of tests) {
      console.log(`\n🧪 Running: ${test.name}`)
      const result = await runLoadTest(test.config)
      results.push({ name: test.name, result })

      // Cool down between tests
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Display results
    console.log('\n📊 Load Test Results:')
    console.log('-'.repeat(100))
    console.log('| Test                    | RPS    | Avg Lat | P95 Lat | Success Rate | Errors |')
    console.log('-'.repeat(100))

    for (const { name, result } of results) {
      const testName = name.padEnd(23)
      const rps = result.rps.toFixed(0).padStart(6)
      const avgLat = `${result.avgLatency.toFixed(1)}ms`.padStart(7)
      const p95Lat = `${result.p95Latency.toFixed(1)}ms`.padStart(7)
      const successRate =
        `${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%`.padStart(12)
      const errorCount = result.failedRequests.toString().padStart(6)

      console.log(
        `| ${testName} | ${rps} | ${avgLat} | ${p95Lat} | ${successRate} | ${errorCount} |`
      )
    }
    console.log('-'.repeat(100))

    // Performance targets check
    console.log('\n🎯 Performance Targets:')
    const targets = [
      { name: 'Health RPS (Light)', target: 1000, actual: results[0].result.rps },
      { name: 'Health RPS (Heavy)', target: 500, actual: results[1].result.rps },
      {
        name: 'P95 Latency (< 50ms)',
        target: 50,
        actual: results[0].result.p95Latency,
        reverse: true,
      },
      {
        name: 'Success Rate (> 99%)',
        target: 99,
        actual: (results[0].result.successfulRequests / results[0].result.totalRequests) * 100,
      },
    ]

    for (const check of targets) {
      const passed = check.reverse ? check.actual <= check.target : check.actual >= check.target
      const status = passed ? '✅' : '❌'
      const unit = check.name.includes('RPS') ? ' RPS' : check.name.includes('Latency') ? 'ms' : '%'
      console.log(
        `${status} ${check.name}: ${check.actual.toFixed(1)}${unit} (target: ${check.reverse ? '<=' : '>='} ${check.target}${unit})`
      )
    }
  } finally {
    server.close()
    console.log('\n🛑 Test server stopped')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllLoadTests().catch(console.error)
}
