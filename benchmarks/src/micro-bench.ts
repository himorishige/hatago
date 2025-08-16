#!/usr/bin/env tsx

/**
 * Micro-benchmarks for Hatago core functionality
 * Tests individual operations performance
 */

import { performance } from 'node:perf_hooks'
import { createApp } from '@hatago/core'

interface BenchResult {
  name: string
  operations: number
  duration: number
  opsPerSec: number
  avgLatency: number
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations = 1000
): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations); i++) {
    await fn()
  }

  // Actual benchmark
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    await fn()
  }
  const end = performance.now()

  const duration = end - start
  const opsPerSec = (iterations / duration) * 1000
  const avgLatency = duration / iterations

  return {
    name,
    operations: iterations,
    duration,
    opsPerSec,
    avgLatency,
  }
}

async function runMicroBenchmarks() {
  console.log('🚀 Hatago Micro-benchmarks')
  console.log('='.repeat(50))

  const results: BenchResult[] = []

  // 1. App creation benchmark
  results.push(
    await benchmark(
      'App Creation',
      async () => {
        const { app } = await createApp({
          name: 'bench',
          version: '0.1.0',
          plugins: [],
        })
        // Simulate cleanup
        ;(app as any).fetch = undefined
      },
      1000
    )
  )

  // 2. App creation with default plugins
  results.push(
    await benchmark(
      'App Creation (with plugins)',
      async () => {
        const { app } = await createApp({
          name: 'bench',
          version: '0.1.0',
          // Uses default plugins
        })
        ;(app as any).fetch = undefined
      },
      100
    )
  )

  // 3. Request handling benchmark
  const { app } = await createApp({ name: 'bench', plugins: [] })
  if (!app) {
    throw new Error('Failed to create app for benchmarks')
  }
  results.push(
    await benchmark(
      'Health endpoint',
      async () => {
        const request = new Request('http://localhost:8787/health')
        const response = await app.fetch(request)
        await response.text()
      },
      1000
    )
  )

  // 4. JSON response benchmark (try metrics.json, fallback to health)
  try {
    const testRequest = new Request('http://localhost:8787/metrics.json')
    const testResponse = await app.fetch(testRequest)
    if (testResponse.ok) {
      results.push(
        await benchmark(
          'JSON response',
          async () => {
            const request = new Request('http://localhost:8787/metrics.json')
            const response = await app.fetch(request)
            await response.json()
          },
          1000
        )
      )
    } else {
      throw new Error('metrics.json not available')
    }
  } catch {
    // Fallback to health endpoint
    results.push(
      await benchmark(
        'JSON response (health)',
        async () => {
          const request = new Request('http://localhost:8787/health')
          const response = await app.fetch(request)
          await response.json()
        },
        1000
      )
    )
  }

  // 5. Context creation overhead
  let _contextCount = 0
  results.push(
    await benchmark(
      'Context creation',
      async () => {
        const _ctx = {
          app,
          server: {} as unknown,
          env: { test: true },
          getBaseUrl: (req: Request) => new URL(req.url),
        }
        _contextCount++
      },
      10000
    )
  )

  // Display results
  console.log('\n📊 Results:')
  console.log('-'.repeat(80))
  console.log('| Test                      | Ops/sec  | Avg Latency | Duration |')
  console.log('-'.repeat(80))

  for (const result of results) {
    const name = result.name.padEnd(25)
    const opsPerSec = result.opsPerSec.toFixed(0).padStart(8)
    const avgLatency = `${result.avgLatency.toFixed(3)}ms`.padStart(11)
    const duration = `${result.duration.toFixed(1)}ms`.padStart(8)
    console.log(`| ${name} | ${opsPerSec} | ${avgLatency} | ${duration} |`)
  }
  console.log('-'.repeat(80))

  // Performance budget checks
  console.log('\n🎯 Performance Budget Check:')
  const budgets = [
    { name: 'App Creation', budget: 100, actual: results[0]?.opsPerSec ?? 0 }, // 100 ops/sec
    { name: 'Health endpoint', budget: 5000, actual: results[2]?.opsPerSec ?? 0 }, // 5000 ops/sec
    { name: 'Context creation', budget: 50000, actual: results[4]?.opsPerSec ?? 0 }, // 50k ops/sec
  ]

  for (const check of budgets) {
    const status = check.actual >= check.budget ? '✅' : '❌'
    const ratio = ((check.actual / check.budget) * 100).toFixed(1)
    console.log(`${status} ${check.name}: ${check.actual.toFixed(0)} ops/sec (${ratio}% of budget)`)
  }

  // Memory usage
  const memUsage = process.memoryUsage()
  console.log('\n💾 Memory Usage:')
  console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  External: ${(memUsage.external / 1024 / 1024).toFixed(1)} MB`)

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMicroBenchmarks().catch(console.error)
}
