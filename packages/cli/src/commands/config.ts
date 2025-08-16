import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ConfigValidationError,
  type HatagoConfig,
  diagnoseConfig,
  formatDiagnostics,
  generateConfigFixes,
  generateConfigTemplate,
  loadConfig,
  validateConfig,
} from '@hatago/config'
import { cyan, green, red, yellow } from 'colorette'
import { Command } from 'commander'
import { CLIError } from '../utils/error-handler.js'

/**
 * Output result based on JSON flag
 */
function outputResult(data: unknown, message?: string): void {
  if (process.env.HATAGO_JSON_OUTPUT === 'true') {
    console.log(JSON.stringify(data, null, 2))
  } else if (message) {
    console.log(message)
  }
}

/**
 * Handle validation command
 */
async function handleValidate(options: { fix?: boolean }): Promise<void> {
  try {
    const result = await loadConfig()
    const report = diagnoseConfig(result.config)

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        valid: !report.hasErrors,
        issues: report.issues,
        configPath: result.filepath,
      })
      return
    }

    // Console output
    if (result.filepath) {
      console.log(`📋 Checking configuration: ${cyan(result.filepath)}`)
    } else {
      console.log('📋 Checking default configuration (no config file found)')
    }

    console.log(formatDiagnostics(report))

    if (report.hasErrors) {
      if (options.fix && report.canAutoFix) {
        console.log('\\n🔧 Applying automatic fixes...')
        const fixedConfig = generateConfigFixes(result.config)

        // Re-validate fixed config
        const fixedReport = diagnoseConfig(fixedConfig)
        if (!fixedReport.hasErrors) {
          const configContent = JSON.stringify(fixedConfig, null, 2)
          if (result.filepath) {
            writeFileSync(result.filepath, configContent)
            console.log(`${green('✅')} Configuration fixed and saved to ${result.filepath}`)
          } else {
            const defaultPath = resolve('hatago.config.json')
            writeFileSync(defaultPath, configContent)
            console.log(`${green('✅')} Configuration saved to ${defaultPath}`)
          }
        } else {
          console.log(`${yellow('⚠️')} Some issues could not be automatically fixed`)
          console.log(formatDiagnostics(fixedReport))
        }
      }
      throw new CLIError('Configuration validation failed', 1)
    }

    console.log(`\\n${green('✅')} Configuration is valid`)
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      const report = diagnoseConfig({} as HatagoConfig, error)

      if (process.env.HATAGO_JSON_OUTPUT === 'true') {
        outputResult({
          valid: false,
          issues: report.issues,
        })
        return
      }

      console.log(formatDiagnostics(report))
      throw new CLIError('Configuration validation failed', 1)
    }
    throw error
  }
}

/**
 * Handle doctor command
 */
async function handleDoctor(): Promise<void> {
  try {
    const result = await loadConfig({ validate: false })
    const report = diagnoseConfig(result.config)

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        configPath: result.filepath,
        issues: report.issues,
        canAutoFix: report.canAutoFix,
        recommendations: [
          'Run `hatago config validate --fix` to apply automatic fixes',
          'Check external server connectivity with `hatago add-server <endpoint> --test`',
          'Review tool mappings for potential conflicts',
        ],
      })
      return
    }

    console.log(`🏥 ${cyan('Hatago Configuration Doctor')}`)
    console.log('='.repeat(50))

    if (result.filepath) {
      console.log(`\\n📋 Configuration file: ${cyan(result.filepath)}`)
    } else {
      console.log('\\n📋 Using default configuration (no config file found)')
    }

    // Environment check
    console.log('\\n🌍 Environment:')
    console.log(`   Node.js: ${process.version}`)
    console.log(`   Platform: ${process.platform}`)
    console.log(`   Working directory: ${process.cwd()}`)

    // Configuration analysis
    console.log(formatDiagnostics(report))

    // Recommendations
    console.log('\\n💡 Recommendations:')
    const recommendations = [
      'Run periodic health checks on external servers',
      'Use HTTPS endpoints for production deployments',
      'Set up proper authentication for external APIs',
      'Review log levels based on your environment',
    ]

    recommendations.forEach(rec => {
      console.log(`   • ${rec}`)
    })

    if (!report.hasErrors && !report.hasWarnings) {
      console.log(`\\n${green('🎉 Your configuration looks great!')}`)
    }
  } catch (error) {
    console.error(`\\n${red('❌')} Doctor check failed: ${error}`)
    throw new CLIError('Doctor check failed', 1)
  }
}

/**
 * Handle init command
 */
async function handleInit(options: { force?: boolean }): Promise<void> {
  const configPath = resolve('hatago.config.jsonc')

  if (existsSync(configPath) && !options.force) {
    throw new CLIError(
      `Configuration file already exists: ${configPath}\\nUse --force to overwrite`,
      1
    )
  }

  const template = generateConfigTemplate()
  writeFileSync(configPath, template)

  outputResult(
    { configPath, created: true },
    `${green('✅')} Created configuration file: ${cyan(configPath)}`
  )
}

/**
 * Handle get command
 */
async function handleGet(path?: string): Promise<void> {
  const result = await loadConfig()

  if (!path) {
    outputResult(result.config, JSON.stringify(result.config, null, 2))
    return
  }

  // Navigate to specific path
  const parts = path.split('.')
  let current: unknown = result.config

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      throw new CLIError(`Configuration path not found: ${path}`, 1)
    }
  }

  outputResult({ path, value: current }, JSON.stringify(current, null, 2))
}

/**
 * Create config command
 */
export const configCommand = new Command('config').description('Manage Hatago configuration')

configCommand
  .command('validate')
  .description('Validate configuration file')
  .option('--fix', 'Automatically fix common issues')
  .action(handleValidate)

configCommand
  .command('doctor')
  .alias('dr')
  .description('Run comprehensive configuration diagnostics')
  .action(handleDoctor)

configCommand
  .command('init')
  .description('Create a new configuration file')
  .option('-f, --force', 'Overwrite existing configuration file')
  .action(handleInit)

configCommand.command('get [path]').description('Get configuration value(s)').action(handleGet)

// Add help examples
configCommand.on('--help', () => {
  console.log(`
Examples:
  hatago config validate              Validate current configuration
  hatago config validate --fix       Validate and auto-fix issues
  hatago config doctor                Run comprehensive health check
  hatago config init                  Create new configuration file
  hatago config get                   Show entire configuration
  hatago config get server.port      Get specific configuration value
  hatago config get proxy.servers    Get proxy server list
`)
})
