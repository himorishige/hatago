import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'

export interface MetricsConfig {
  /** Enable metrics collection */
  enabled?: boolean
  /** Metrics endpoint path */
  endpoint?: string
  /** Custom labels to add to all metrics */
  labels?: Record<string, string>
}

interface MetricData {
  requests_total: Record<string, number>
  request_duration_histogram: Array<{
    method: string
    path: string
    status: number
    duration: number
    timestamp: number
  }>
  errors_total: Record<string, number>
}

/**
 * Lightweight metrics plugin
 * Tracks 3 core metrics: requests_total, request_duration_ms, errors_total
 */
export const metrics: HatagoPluginFactory<MetricsConfig> =
  (config: MetricsConfig = {}): HatagoPlugin =>
  ({ app }) => {
    if (config.enabled === false) {
      return
    }

    const endpoint = config.endpoint || '/metrics'
    const labels = config.labels || {}

    // In-memory metrics storage
    const metrics: MetricData = {
      requests_total: {},
      request_duration_histogram: [],
      errors_total: {},
    }

    // Helper to create metric key
    const createKey = (method: string, path: string, status?: number) => {
      const baseKey = `method="${method}",path="${path}"`
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',')
      const statusStr = status ? `,status="${status}"` : ''
      return `{${[baseKey, labelStr, statusStr].filter(Boolean).join(',')}}`
    }

    // Metrics middleware
    app.use('*', async (c, next) => {
      const start = Date.now()
      const method = c.req.method
      const path = c.req.path

      try {
        await next()

        const duration = Date.now() - start
        const status = c.res.status

        // Increment requests_total
        const requestKey = createKey(method, path, status)
        metrics.requests_total[requestKey] = (metrics.requests_total[requestKey] || 0) + 1

        // Record request duration
        metrics.request_duration_histogram.push({
          method,
          path,
          status,
          duration,
          timestamp: Date.now(),
        })

        // Limit histogram size (keep last 1000 entries)
        if (metrics.request_duration_histogram.length > 1000) {
          metrics.request_duration_histogram = metrics.request_duration_histogram.slice(-1000)
        }

        // Track errors (4xx, 5xx)
        if (status >= 400) {
          const errorKey = createKey(method, path, status)
          metrics.errors_total[errorKey] = (metrics.errors_total[errorKey] || 0) + 1
        }
      } catch (error) {
        const duration = Date.now() - start

        // Record error
        const errorKey = createKey(method, path, 500)
        metrics.errors_total[errorKey] = (metrics.errors_total[errorKey] || 0) + 1

        metrics.request_duration_histogram.push({
          method,
          path,
          status: 500,
          duration,
          timestamp: Date.now(),
        })

        throw error
      }
    })

    // Metrics endpoint (Prometheus format)
    app.get(endpoint, c => {
      const lines: string[] = []

      // requests_total
      lines.push('# HELP requests_total Total number of HTTP requests')
      lines.push('# TYPE requests_total counter')
      for (const [key, value] of Object.entries(metrics.requests_total)) {
        lines.push(`requests_total${key} ${value}`)
      }

      // errors_total
      lines.push('')
      lines.push('# HELP errors_total Total number of HTTP errors (4xx, 5xx)')
      lines.push('# TYPE errors_total counter')
      for (const [key, value] of Object.entries(metrics.errors_total)) {
        lines.push(`errors_total${key} ${value}`)
      }

      // request_duration_ms histogram (simplified)
      lines.push('')
      lines.push('# HELP request_duration_ms HTTP request duration in milliseconds')
      lines.push('# TYPE request_duration_ms histogram')

      // Calculate percentiles from histogram data
      const durations = metrics.request_duration_histogram
        .map(r => r.duration)
        .sort((a, b) => a - b)
      if (durations.length > 0) {
        const p50 = durations[Math.floor(durations.length * 0.5)]
        const p95 = durations[Math.floor(durations.length * 0.95)]
        const p99 = durations[Math.floor(durations.length * 0.99)]
        const max = durations[durations.length - 1]

        const histogramKey = createKey('*', '*')
        lines.push(
          `request_duration_ms_bucket{le="10"${histogramKey.slice(1, -1)}} ${durations.filter(d => d <= 10).length}`
        )
        lines.push(
          `request_duration_ms_bucket{le="50"${histogramKey.slice(1, -1)}} ${durations.filter(d => d <= 50).length}`
        )
        lines.push(
          `request_duration_ms_bucket{le="100"${histogramKey.slice(1, -1)}} ${durations.filter(d => d <= 100).length}`
        )
        lines.push(
          `request_duration_ms_bucket{le="500"${histogramKey.slice(1, -1)}} ${durations.filter(d => d <= 500).length}`
        )
        lines.push(
          `request_duration_ms_bucket{le="+Inf"${histogramKey.slice(1, -1)}} ${durations.length}`
        )
        lines.push(
          `request_duration_ms_sum${histogramKey} ${durations.reduce((sum, d) => sum + d, 0)}`
        )
        lines.push(`request_duration_ms_count${histogramKey} ${durations.length}`)

        // Add percentile info as comments
        lines.push(`# p50: ${p50}ms, p95: ${p95}ms, p99: ${p99}ms, max: ${max}ms`)
      }

      return c.text(lines.join('\n'), 200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      })
    })

    // JSON metrics endpoint for easier consumption
    app.get(`${endpoint}.json`, c => {
      const durations = metrics.request_duration_histogram
        .map(r => r.duration)
        .sort((a, b) => a - b)
      const stats =
        durations.length > 0
          ? {
              count: durations.length,
              sum: durations.reduce((sum, d) => sum + d, 0),
              avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
              p50: durations[Math.floor(durations.length * 0.5)],
              p95: durations[Math.floor(durations.length * 0.95)],
              p99: durations[Math.floor(durations.length * 0.99)],
              min: durations[0],
              max: durations[durations.length - 1],
            }
          : null

      return c.json({
        timestamp: new Date().toISOString(),
        metrics: {
          requests_total: metrics.requests_total,
          errors_total: metrics.errors_total,
          request_duration_stats: stats,
        },
      })
    })
  }

export default metrics
