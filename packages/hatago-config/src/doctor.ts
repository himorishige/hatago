import type { ZodError, ZodIssue } from 'zod'
import type { ConfigValidationError } from './loader.js'
import type { HatagoConfig, MCPServerConfig } from './schema.js'

/**
 * Diagnostic issue severity
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info'

/**
 * Configuration diagnostic issue
 */
export interface DiagnosticIssue {
  severity: DiagnosticSeverity
  path: string
  message: string
  suggestion?: string
  fix?: () => any
}

/**
 * Diagnostic report
 */
export interface DiagnosticReport {
  issues: DiagnosticIssue[]
  hasErrors: boolean
  hasWarnings: boolean
  canAutoFix: boolean
}

/**
 * Convert Zod error to diagnostic issues
 */
function zodErrorToDiagnostics(zodError: ZodError): DiagnosticIssue[] {
  return zodError.issues.map((issue: ZodIssue): DiagnosticIssue => {
    const path = issue.path.join('.')

    switch (issue.code) {
      case 'invalid_type':
        return {
          severity: 'error',
          path,
          message: `Expected ${issue.expected}, but received ${issue.received}`,
          suggestion: `Change the value to a ${issue.expected}`,
        }

      case 'invalid_string':
        if (issue.validation === 'url') {
          return {
            severity: 'error',
            path,
            message: 'Invalid URL format',
            suggestion: 'Provide a valid URL starting with http:// or https://',
          }
        }
        return {
          severity: 'error',
          path,
          message: `Invalid string: ${issue.message}`,
        }

      case 'invalid_enum_value':
        return {
          severity: 'error',
          path,
          message: `Invalid value. Expected one of: ${issue.options.join(', ')}`,
          suggestion: `Use one of the valid options: ${issue.options.join(', ')}`,
        }

      case 'unrecognized_keys':
        return {
          severity: 'warning',
          path,
          message: `Unknown configuration keys: ${issue.keys.join(', ')}`,
          suggestion: 'Remove unknown keys or check for typos',
        }

      case 'too_small':
        return {
          severity: 'error',
          path,
          message: `Value is too small. Minimum: ${issue.minimum}`,
          suggestion: `Increase the value to at least ${issue.minimum}`,
        }

      case 'too_big':
        return {
          severity: 'error',
          path,
          message: `Value is too large. Maximum: ${issue.maximum}`,
          suggestion: `Decrease the value to at most ${issue.maximum}`,
        }

      default:
        return {
          severity: 'error',
          path,
          message: issue.message,
        }
    }
  })
}

/**
 * Perform additional semantic validation
 */
function performSemanticValidation(config: HatagoConfig): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []

  // Check proxy configuration
  if (config.proxy?.servers) {
    const serverIds = new Set<string>()

    config.proxy.servers.forEach((server, index) => {
      const serverPath = `proxy.servers[${index}]`

      // Check for duplicate server IDs
      if (serverIds.has(server.id)) {
        issues.push({
          severity: 'error',
          path: `${serverPath}.id`,
          message: `Duplicate server ID: ${server.id}`,
          suggestion: 'Use unique server IDs',
        })
      } else {
        serverIds.add(server.id)
      }

      // Check endpoint reachability (warning only)
      if (server.endpoint.startsWith('http://')) {
        issues.push({
          severity: 'warning',
          path: `${serverPath}.endpoint`,
          message: 'Using HTTP endpoint (not secure)',
          suggestion: 'Consider using HTTPS for production deployments',
        })
      }

      // Check auth configuration consistency
      if (server.auth) {
        switch (server.auth.type) {
          case 'bearer':
            if (!server.auth.token) {
              issues.push({
                severity: 'error',
                path: `${serverPath}.auth.token`,
                message: 'Bearer token is required when using bearer authentication',
                suggestion: 'Provide a token or use environment variable like ${API_TOKEN}',
              })
            }
            break

          case 'basic':
            if (!server.auth.username || !server.auth.password) {
              issues.push({
                severity: 'error',
                path: `${serverPath}.auth`,
                message: 'Username and password are required for basic authentication',
                suggestion: 'Provide both username and password',
              })
            }
            break

          case 'custom':
            if (!server.auth.headers || Object.keys(server.auth.headers).length === 0) {
              issues.push({
                severity: 'error',
                path: `${serverPath}.auth.headers`,
                message: 'Custom headers are required when using custom authentication',
                suggestion: 'Provide authentication headers',
              })
            }
            break
        }
      }

      // Check tool configuration
      if (server.tools) {
        if (server.tools.include && server.tools.exclude) {
          const hasOverlap = server.tools.include.some(include =>
            server.tools!.exclude!.some(exclude => include === exclude)
          )

          if (hasOverlap) {
            issues.push({
              severity: 'warning',
              path: `${serverPath}.tools`,
              message: 'Tool include and exclude patterns may conflict',
              suggestion: 'Review include/exclude patterns to avoid conflicts',
            })
          }
        }
      }
    })
  }

  // Check server configuration
  if (config.server) {
    // Check port conflicts
    const commonPorts = [80, 443, 3000, 5000, 8000, 8080]
    if (commonPorts.includes(config.server.port)) {
      issues.push({
        severity: 'info',
        path: 'server.port',
        message: `Port ${config.server.port} is commonly used by other applications`,
        suggestion: 'Consider using a different port if conflicts occur',
      })
    }
  }

  // Check logging configuration
  if (config.logging?.output === 'file' && !config.logging.file) {
    issues.push({
      severity: 'error',
      path: 'logging.file',
      message: 'Log file path is required when output is set to file',
      suggestion: 'Provide a file path or change output to console',
    })
  }

  return issues
}

/**
 * Run comprehensive configuration diagnostics
 */
export function diagnoseConfig(
  config: HatagoConfig,
  validationError?: ConfigValidationError
): DiagnosticReport {
  const issues: DiagnosticIssue[] = []

  // Add validation errors if present
  if (validationError) {
    issues.push(...zodErrorToDiagnostics(validationError.zodError))
  }

  // Perform semantic validation
  issues.push(...performSemanticValidation(config))

  // Calculate report metrics
  const hasErrors = issues.some(issue => issue.severity === 'error')
  const hasWarnings = issues.some(issue => issue.severity === 'warning')
  const canAutoFix = issues.some(issue => issue.fix !== undefined)

  return {
    issues,
    hasErrors,
    hasWarnings,
    canAutoFix,
  }
}

/**
 * Generate fixes for common configuration issues
 */
export function generateConfigFixes(config: HatagoConfig): HatagoConfig {
  const fixedConfig = JSON.parse(JSON.stringify(config)) // Deep clone

  // Auto-fix common issues
  if (fixedConfig.proxy?.servers) {
    fixedConfig.proxy.servers.forEach((server: MCPServerConfig) => {
      // Auto-generate namespace from ID if missing
      if (!server.namespace) {
        server.namespace = server.id
      }

      // Set default health check if missing
      if (!server.healthCheck) {
        server.healthCheck = {
          enabled: true,
          interval: 30000,
          timeout: 5000,
        }
      }

      // Set default timeout if missing
      if (!server.timeout) {
        server.timeout = 30000
      }
    })
  }

  // Ensure logging file is set when output is file
  if (fixedConfig.logging?.output === 'file' && !fixedConfig.logging.file) {
    fixedConfig.logging.file = './hatago.log'
  }

  return fixedConfig
}

/**
 * Format diagnostic issues for console output
 */
export function formatDiagnostics(report: DiagnosticReport): string {
  if (report.issues.length === 0) {
    return '✅ Configuration is valid'
  }

  const lines: string[] = []

  // Group issues by severity
  const errors = report.issues.filter(issue => issue.severity === 'error')
  const warnings = report.issues.filter(issue => issue.severity === 'warning')
  const info = report.issues.filter(issue => issue.severity === 'info')

  if (errors.length > 0) {
    lines.push(`\\n❌ ${errors.length} Error(s):`)
    errors.forEach(issue => {
      lines.push(`   ${issue.path}: ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`      💡 ${issue.suggestion}`)
      }
    })
  }

  if (warnings.length > 0) {
    lines.push(`\\n⚠️  ${warnings.length} Warning(s):`)
    warnings.forEach(issue => {
      lines.push(`   ${issue.path}: ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`      💡 ${issue.suggestion}`)
      }
    })
  }

  if (info.length > 0) {
    lines.push(`\\nℹ️  ${info.length} Info:`)
    info.forEach(issue => {
      lines.push(`   ${issue.path}: ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`      💡 ${issue.suggestion}`)
      }
    })
  }

  if (report.canAutoFix) {
    lines.push(`\\n🔧 Some issues can be auto-fixed. Run 'hatago config fix' to apply fixes.`)
  }

  return lines.join('\\n')
}
