import type { HatagoPlugin } from '../types.js'
import { healthEndpoints } from './health-endpoints.js'
import { helloHatago } from './hello-hatago.js'
import { oauthMetadata } from './oauth-metadata.js'
import { pluginSecurity } from './plugin-security.js'
import { sloMetrics } from './slo-metrics.js'
import { LogLevel, structuredLogging } from './structured-logging.js'

/**
 * Create default plugins with environment-based configuration
 */
export function createDefaultPlugins(env: Record<string, unknown> = {}): HatagoPlugin[] {
  // Environment variables with defaults
  const REQUIRE_AUTH = env.REQUIRE_AUTH === 'true'
  const AUTH_ISSUER = (env.AUTH_ISSUER as string) || 'https://accounts.example.com'
  const RESOURCE = env.RESOURCE as string | undefined
  const PLUGIN_SECURITY_ENABLED = env.PLUGIN_SECURITY_ENABLED !== 'false'
  const REQUIRE_SIGNED_PLUGINS = env.REQUIRE_SIGNED_PLUGINS === 'true'
  
  return [
    // Structured logging (disabled in test environment to prevent memory leaks)
    structuredLogging({
      enabled: (env.NODE_ENV || process.env.NODE_ENV) !== 'test',
      level: env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
      format: (env.NODE_ENV || process.env.NODE_ENV) === 'production' ? 'json' : 'compact',
      includeStackTrace: (env.NODE_ENV || process.env.NODE_ENV) !== 'production',
    }),

    // Plugin security and signature verification (disabled in test environment)
    pluginSecurity({
      enabled: PLUGIN_SECURITY_ENABLED && (env.NODE_ENV || process.env.NODE_ENV) !== 'test',
      requireSigned: REQUIRE_SIGNED_PLUGINS,
      allowTestKeys: (env.NODE_ENV || process.env.NODE_ENV) !== 'production',
      maxSignatureAgeHours: 24,
      blockUnsigned: REQUIRE_SIGNED_PLUGINS,
    }),

    // Stream "Hello Hatago" demo tool (disabled in test environment to prevent memory leaks)
    ...(((env.NODE_ENV || process.env.NODE_ENV) !== 'test') ? [helloHatago()] : []),

    // Health endpoints for monitoring (disabled in test environment to prevent memory leaks)
    healthEndpoints({ enabled: (env.NODE_ENV || process.env.NODE_ENV) !== 'test' }),

    // SLO-compliant metrics collection (disabled in test environment to prevent memory leaks)
    sloMetrics({
      enabled: (env.NODE_ENV || process.env.NODE_ENV) !== 'test',
      sloTargets: {
        availability: 99.95,
        p95LatencyMs: 5,
        p99LatencyMs: 10,
        errorRatePercent: 0.1,
      },
    }),

    // OAuth Protected Resource Metadata (RFC 9728) (disabled in test environment)
    ...((env.NODE_ENV || process.env.NODE_ENV) !== 'test' ? [oauthMetadata({
      issuer: AUTH_ISSUER,
      ...(RESOURCE && { resource: RESOURCE }),
      requireAuth: REQUIRE_AUTH,
    })] : []),
  ]
}
