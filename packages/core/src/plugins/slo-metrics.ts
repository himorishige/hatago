import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'

export interface SLOMetricsConfig {
  /** Enable SLO metrics collection */
  enabled?: boolean
  /** Metrics endpoint path */
  endpoint?: string
  /** SLO targets for alerting */
  sloTargets?: {
    /** Availability target (e.g., 99.95) */
    availability?: number
    /** P95 latency target in milliseconds */
    p95LatencyMs?: number
    /** P99 latency target in milliseconds */
    p99LatencyMs?: number
    /** Error rate target (e.g., 0.1 for 0.1%) */
    errorRatePercent?: number
  }
  /** Custom labels to add to all metrics */
  labels?: Record<string, string>
}

interface SLOMetricData {
  // Core SLO metrics
  requests_total: Map<string, number>
  request_duration_seconds: Array<{
    endpoint: string
    duration: number
    timestamp: number
  }>
  inflight_requests: number
  errors_total: Map<string, number>
  
  // Plugin metrics
  plugin_events_total: Map<string, number>
  plugin_failures_total: Map<string, number>
}

/**
 * SLO-compliant metrics plugin
 * Implements standardized metric names following hatago_* convention
 */
export const sloMetrics: HatagoPluginFactory<SLOMetricsConfig> =
  (config: SLOMetricsConfig = {}): HatagoPlugin =>
  ({ app }) => {
    if (config.enabled === false) {
      return
    }

    const endpoint = config.endpoint || '/metrics'
    const labels = config.labels || {}
    const sloTargets = {
      availability: 99.95,
      p95LatencyMs: 5,
      p99LatencyMs: 10,
      errorRatePercent: 0.1,
      ...config.sloTargets
    }
    
    // SLO metrics storage
    const metrics: SLOMetricData = {
      requests_total: new Map(),
      request_duration_seconds: [],
      inflight_requests: 0,
      errors_total: new Map(),
      plugin_events_total: new Map(),
      plugin_failures_total: new Map()
    }

    // Helper to create metric key with SLO-compliant labels
    const createMetricKey = (endpoint: string, code?: number, reason?: string) => {
      const baseLabels = [`endpoint="${endpoint}"`]
      
      if (code !== undefined) {
        baseLabels.push(`code="${code}"`)
      }
      
      if (reason) {
        baseLabels.push(`reason="${reason}"`)
      }
      
      // Add custom labels
      for (const [key, value] of Object.entries(labels)) {
        baseLabels.push(`${key}="${value}"`)
      }
      
      return baseLabels.join(',')
    }

    // SLO metrics middleware
    app.use('*', async (c, next) => {
      const start = Date.now()
      const endpoint = c.req.path
      
      // Track inflight requests
      metrics.inflight_requests++
      
      try {
        await next()
        
        const durationMs = Date.now() - start
        const durationSeconds = durationMs / 1000
        const status = c.res.status

        // Update requests_total
        const requestKey = createMetricKey(endpoint, status)
        metrics.requests_total.set(requestKey, (metrics.requests_total.get(requestKey) || 0) + 1)

        // Record request duration (keep last 10,000 for histogram calculation)
        metrics.request_duration_seconds.push({
          endpoint,
          duration: durationSeconds,
          timestamp: Date.now()
        })
        
        if (metrics.request_duration_seconds.length > 10000) {
          metrics.request_duration_seconds = metrics.request_duration_seconds.slice(-10000)
        }

        // Track errors (4xx, 5xx) with reason classification
        if (status >= 400) {
          let reason = 'unknown'
          if (status >= 400 && status < 500) {
            reason = 'client_error'
          } else if (status >= 500) {
            reason = 'server_error'
          }
          
          const errorKey = createMetricKey(endpoint, status, reason)
          metrics.errors_total.set(errorKey, (metrics.errors_total.get(errorKey) || 0) + 1)
        }

      } catch (error) {
        const durationMs = Date.now() - start
        const durationSeconds = durationMs / 1000
        
        // Record error metrics
        const errorKey = createMetricKey(endpoint, 500, 'exception')
        metrics.errors_total.set(errorKey, (metrics.errors_total.get(errorKey) || 0) + 1)
        
        const requestKey = createMetricKey(endpoint, 500)
        metrics.requests_total.set(requestKey, (metrics.requests_total.get(requestKey) || 0) + 1)
        
        metrics.request_duration_seconds.push({
          endpoint,
          duration: durationSeconds,
          timestamp: Date.now()
        })

        throw error
      } finally {
        // Decrement inflight requests
        metrics.inflight_requests--
      }
    })

    // Plugin event tracking helper
    const trackPluginEvent = (pluginName: string, event: string, success: boolean = true) => {
      const eventKey = createMetricKey(pluginName, undefined, event)
      metrics.plugin_events_total.set(eventKey, (metrics.plugin_events_total.get(eventKey) || 0) + 1)
      
      if (!success) {
        const failureKey = createMetricKey(pluginName, undefined, event)
        metrics.plugin_failures_total.set(failureKey, (metrics.plugin_failures_total.get(failureKey) || 0) + 1)
      }
    }

    // Prometheus format metrics endpoint
    app.get(endpoint, c => {
      const lines: string[] = []
      const now = Date.now()
      
      // SLO targets as info metrics
      lines.push('# HELP hatago_slo_target SLO targets for monitoring')
      lines.push('# TYPE hatago_slo_target gauge')
      lines.push(`hatago_slo_target{metric="availability_percent"} ${sloTargets.availability}`)
      lines.push(`hatago_slo_target{metric="p95_latency_ms"} ${sloTargets.p95LatencyMs}`)
      lines.push(`hatago_slo_target{metric="p99_latency_ms"} ${sloTargets.p99LatencyMs}`)
      lines.push(`hatago_slo_target{metric="error_rate_percent"} ${sloTargets.errorRatePercent}`)
      
      // requests_total
      lines.push('')
      lines.push('# HELP hatago_requests_total Total number of HTTP requests')
      lines.push('# TYPE hatago_requests_total counter')
      for (const [key, value] of metrics.requests_total.entries()) {
        lines.push(`hatago_requests_total{${key}} ${value}`)
      }
      
      // errors_total
      lines.push('')
      lines.push('# HELP hatago_errors_total Total number of HTTP errors')
      lines.push('# TYPE hatago_errors_total counter')
      for (const [key, value] of metrics.errors_total.entries()) {
        lines.push(`hatago_errors_total{${key}} ${value}`)
      }

      // inflight_requests
      lines.push('')
      lines.push('# HELP hatago_inflight_requests Number of requests currently being processed')
      lines.push('# TYPE hatago_inflight_requests gauge')
      lines.push(`hatago_inflight_requests ${metrics.inflight_requests}`)

      // request_duration_seconds histogram
      lines.push('')
      lines.push('# HELP hatago_request_duration_seconds Request duration in seconds')
      lines.push('# TYPE hatago_request_duration_seconds histogram')
      
      // Calculate histogram buckets
      const durations = metrics.request_duration_seconds.map(r => r.duration).sort((a, b) => a - b)
      if (durations.length > 0) {
        const buckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        const sum = durations.reduce((s, d) => s + d, 0)
        const count = durations.length
        
        for (const le of buckets) {
          const bucketCount = durations.filter(d => d <= le).length
          lines.push(`hatago_request_duration_seconds_bucket{le="${le}"} ${bucketCount}`)
        }
        
        lines.push(`hatago_request_duration_seconds_bucket{le="+Inf"} ${count}`)
        lines.push(`hatago_request_duration_seconds_sum ${sum.toFixed(6)}`)
        lines.push(`hatago_request_duration_seconds_count ${count}`)
        
        // SLO compliance indicators
        const p95 = (durations[Math.floor(durations.length * 0.95)] || 0) * 1000 // Convert to ms
        const p99 = (durations[Math.floor(durations.length * 0.99)] || 0) * 1000
        
        lines.push('')
        lines.push('# HELP hatago_slo_compliance SLO compliance indicators (1=compliant, 0=violated)')
        lines.push('# TYPE hatago_slo_compliance gauge')
        lines.push(`hatago_slo_compliance{metric="p95_latency"} ${p95 <= sloTargets.p95LatencyMs ? 1 : 0}`)
        lines.push(`hatago_slo_compliance{metric="p99_latency"} ${p99 <= sloTargets.p99LatencyMs ? 1 : 0}`)
      }

      // Plugin metrics
      if (metrics.plugin_events_total.size > 0) {
        lines.push('')
        lines.push('# HELP hatago_plugin_events_total Total plugin events')
        lines.push('# TYPE hatago_plugin_events_total counter')
        for (const [key, value] of metrics.plugin_events_total.entries()) {
          lines.push(`hatago_plugin_events_total{${key}} ${value}`)
        }
      }

      if (metrics.plugin_failures_total.size > 0) {
        lines.push('')
        lines.push('# HELP hatago_plugin_failures_total Total plugin failures')
        lines.push('# TYPE hatago_plugin_failures_total counter')
        for (const [key, value] of metrics.plugin_failures_total.entries()) {
          lines.push(`hatago_plugin_failures_total{${key}} ${value}`)
        }
      }

      return c.text(lines.join('\n'), 200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
      })
    })

    // JSON metrics endpoint for easier consumption
    app.get(`${endpoint}.json`, c => {
      const durations = metrics.request_duration_seconds.map(r => r.duration * 1000).sort((a, b) => a - b)
      const stats = durations.length > 0 ? {
        count: durations.length,
        p50: durations[Math.floor(durations.length * 0.5)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)],
        max: durations[durations.length - 1]
      } : null

      return c.json({
        timestamp: new Date().toISOString(),
        slo_targets: sloTargets,
        metrics: {
          requests_total: Object.fromEntries(metrics.requests_total),
          errors_total: Object.fromEntries(metrics.errors_total),
          inflight_requests: metrics.inflight_requests,
          request_duration_stats: stats,
          plugin_events_total: Object.fromEntries(metrics.plugin_events_total),
          plugin_failures_total: Object.fromEntries(metrics.plugin_failures_total)
        },
        slo_compliance: stats ? {
          p95_latency: (stats.p95 || 0) <= sloTargets.p95LatencyMs,
          p99_latency: (stats.p99 || 0) <= sloTargets.p99LatencyMs
        } : null
      })
    })

    // Note: trackPluginEvent is available in scope for other plugins if needed
  }

export default sloMetrics