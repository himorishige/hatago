import { red, yellow } from 'colorette'
import { ConfigValidationError } from '@hatago/config'

/**
 * CLI error with exit code
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message)
    this.name = 'CLIError'
  }
}

/**
 * Format error for console output
 */
function formatError(error: Error): string {
  if (error instanceof ConfigValidationError) {
    const lines = [red('❌ Configuration validation failed:'), '']

    // Add Zod validation errors
    for (const issue of error.zodError.issues) {
      const path = issue.path.join('.')
      lines.push(`${red('  •')} ${path}: ${issue.message}`)
    }

    return lines.join('\\n')
  }

  if (error instanceof CLIError) {
    return `${red('❌')} ${error.message}`
  }

  return `${red('❌ Unexpected error:')} ${error.message}`
}

/**
 * Handle process warnings
 */
function handleWarning(warning: Error): void {
  if (process.env.HATAGO_VERBOSE === 'true') {
    console.warn(`${yellow('⚠️  Warning:')} ${warning.message}`)
  }
}

/**
 * Handle uncaught exceptions
 */
function handleUncaughtException(error: Error): void {
  console.error('\\n' + formatError(error))

  if (process.env.HATAGO_VERBOSE === 'true' && error.stack) {
    console.error('\\nStack trace:')
    console.error(error.stack)
  }

  console.error(
    '\\nThis is likely a bug. Please report it at: https://github.com/himorishige/hatago/issues'
  )
  process.exit(1)
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(reason: any): void {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  handleUncaughtException(error)
}

/**
 * Setup global error handling
 */
export function setupErrorHandling(): void {
  process.on('warning', handleWarning)
  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)

  // Handle SIGINT gracefully
  process.on('SIGINT', () => {
    console.log('\\n👋 Goodbye!')
    process.exit(0)
  })
}
