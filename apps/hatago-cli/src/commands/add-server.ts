import { Command } from 'commander'
import { writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { green, red, yellow, cyan, blue } from 'colorette'
import {
  loadConfig,
  validateConfig,
  type HatagoConfig,
  type ProxyServerConfig,
  ConfigValidationError,
} from '@hatago/config'
import { CLIError } from '../utils/error-handler.js'

/**
 * Add server options
 */
interface AddServerOptions {
  id?: string
  namespace?: string
  description?: string
  timeout?: number
  authType?: 'bearer' | 'basic' | 'custom'
  authToken?: string
  authUsername?: string
  authPassword?: string
  test?: boolean
  include?: string[]
  exclude?: string[]
  rename?: Record<string, string>
  healthCheck?: boolean
  interactive?: boolean
  dry?: boolean
}

/**
 * Output result based on JSON flag
 */
function outputResult(data: any, message?: string): void {
  if (process.env.HATAGO_JSON_OUTPUT === 'true') {
    console.log(JSON.stringify(data, null, 2))
  } else if (message) {
    console.log(message)
  }
}

/**
 * Test MCP server connectivity
 */
async function testMcpServer(endpoint: string, auth?: ProxyServerConfig['auth']): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (auth) {
      if (auth.type === 'bearer' && auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`
      } else if (auth.type === 'basic' && auth.username && auth.password) {
        const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
        headers['Authorization'] = `Basic ${credentials}`
      }
    }

    // Test initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'hatago-cli',
          version: '0.1.0',
        },
      },
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(initRequest),
    })

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`)
      return false
    }

    const result = await response.json()

    if (result.error) {
      console.error(`❌ MCP Error: ${result.error.message}`)
      return false
    }

    console.log(`✅ Server responded: ${result.result?.serverInfo?.name || 'Unknown'}`)
    return true
  } catch (error) {
    console.error(`❌ Connection failed: ${error}`)
    return false
  }
}

/**
 * Prompt for interactive input
 */
async function promptInput(question: string, defaultValue?: string): Promise<string> {
  return new Promise(resolve => {
    const { createInterface } = require('readline')
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `

    rl.question(prompt, (answer: string) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

/**
 * Interactive server configuration
 */
async function interactiveConfig(endpoint: string): Promise<Partial<ProxyServerConfig>> {
  console.log(`\\n🔧 ${cyan('Interactive Configuration')}`)
  console.log('='.repeat(40))

  const config: Partial<ProxyServerConfig> = {
    endpoint,
  }

  // Basic info
  config.id = await promptInput('Server ID', generateServerId(endpoint))
  config.namespace = await promptInput('Namespace', config.id)
  config.description = await promptInput('Description (optional)')

  // Authentication
  const needsAuth = await promptInput('Requires authentication? (y/N)', 'n')
  if (needsAuth.toLowerCase() === 'y') {
    const authType = (await promptInput('Auth type (bearer/basic)', 'bearer')) as 'bearer' | 'basic'

    config.auth = { type: authType }

    if (authType === 'bearer') {
      config.auth.token = await promptInput('Bearer token')
    } else if (authType === 'basic') {
      config.auth.username = await promptInput('Username')
      config.auth.password = await promptInput('Password')
    }
  }

  // Advanced options
  const advancedConfig = await promptInput('Configure advanced options? (y/N)', 'n')
  if (advancedConfig.toLowerCase() === 'y') {
    const timeoutStr = await promptInput('Timeout (ms)', '30000')
    config.timeout = parseInt(timeoutStr, 10)

    const enableHealthCheck = await promptInput('Enable health checks? (Y/n)', 'y')
    if (enableHealthCheck.toLowerCase() !== 'n') {
      config.healthCheck = {
        enabled: true,
        interval: 30000,
        timeout: 5000,
      }
    }
  }

  return config
}

/**
 * Generate server ID from endpoint
 */
function generateServerId(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    const hostname = url.hostname.replace(/\\./g, '-')
    const port = url.port ? `-${url.port}` : ''
    return `${hostname}${port}`
  } catch {
    return 'mcp-server'
  }
}

/**
 * Update configuration file
 */
async function updateConfigFile(
  newServer: ProxyServerConfig,
  dryRun: boolean = false
): Promise<void> {
  const { config, filepath } = await loadConfig()

  if (!config.proxy) {
    config.proxy = {
      servers: [],
      namespaceStrategy: 'prefix',
      conflictResolution: 'error',
      namespace: {
        separator: ':',
        caseSensitive: false,
        maxLength: 64,
      },
    }
  }

  // Check for existing server with same ID
  const existingIndex = config.proxy.servers.findIndex(s => s.id === newServer.id)
  if (existingIndex >= 0) {
    config.proxy.servers[existingIndex] = newServer
    console.log(`✏️  Updated existing server: ${cyan(newServer.id)}`)
  } else {
    config.proxy.servers.push(newServer)
    console.log(`✅ Added new server: ${cyan(newServer.id)}`)
  }

  // Validate updated configuration
  try {
    validateConfig(config)
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(`\\n${red('❌')} Configuration validation failed:`)
      for (const issue of error.zodError.issues) {
        const path = issue.path.join('.')
        console.error(`   • ${path}: ${issue.message}`)
      }
      throw new CLIError('Configuration validation failed', 1)
    }
    throw error
  }

  if (dryRun) {
    console.log(`\\n${yellow('📋')} Dry run - configuration not saved`)
    console.log('Updated configuration:')
    console.log(JSON.stringify(config, null, 2))
    return
  }

  // Save configuration
  const configPath = filepath || resolve('hatago.config.jsonc')
  const configContent = JSON.stringify(config, null, 2)
  writeFileSync(configPath, configContent)

  console.log(`💾 Configuration saved to: ${configPath}`)
}

/**
 * Handle add-server command
 */
async function handleAddServer(endpoint: string, options: AddServerOptions): Promise<void> {
  try {
    if (!endpoint) {
      throw new CLIError('Endpoint URL is required', 1)
    }

    // Validate endpoint URL
    try {
      new URL(endpoint)
    } catch {
      throw new CLIError(`Invalid endpoint URL: ${endpoint}`, 1)
    }

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        action: 'add-server',
        endpoint,
        options,
      })
      return
    }

    console.log(`\\n🔌 ${cyan('Adding MCP Server')}`)
    console.log('='.repeat(40))
    console.log(`📡 Endpoint: ${endpoint}`)

    let serverConfig: Partial<ProxyServerConfig>

    if (options.interactive) {
      serverConfig = await interactiveConfig(endpoint)
    } else {
      // Build configuration from options
      serverConfig = {
        endpoint,
        id: options.id || generateServerId(endpoint),
        namespace: options.namespace,
        description: options.description,
        timeout: options.timeout || 30000,
      }

      // Add authentication if specified
      if (options.authType) {
        serverConfig.auth = {
          type: options.authType,
          token: options.authToken,
          username: options.authUsername,
          password: options.authPassword,
        }
      }

      // Add tool configuration
      if (options.include || options.exclude || options.rename) {
        serverConfig.tools = {
          include: options.include || ['*'],
          exclude: options.exclude,
          rename: options.rename,
        }
      }

      // Add health check configuration
      if (options.healthCheck) {
        serverConfig.healthCheck = {
          enabled: true,
          interval: 30000,
          timeout: 5000,
        }
      }
    }

    // Test connection if requested
    if (options.test) {
      console.log(`\\n🧪 ${yellow('Testing connection...')}`)
      const testResult = await testMcpServer(endpoint, serverConfig.auth)

      if (!testResult) {
        console.log(`\\n${yellow('⚠️  Connection test failed, but server will still be added')}`)
        console.log('You can test the connection later with: hatago test-server <id>')
      } else {
        console.log(`\\n${green('✅')} Connection test passed`)
      }
    }

    // Update configuration
    await updateConfigFile(serverConfig as ProxyServerConfig, options.dry)

    if (!options.dry) {
      console.log(`\\n🎯 Next steps:`)
      console.log(`   1. Test the server: hatago test-server ${serverConfig.id}`)
      console.log(`   2. Start development server: hatago dev`)
      console.log(`   3. Verify tools are available via MCP endpoint`)
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error
    }
    throw new CLIError(`Failed to add server: ${error}`, 1)
  }
}

/**
 * Create add-server command
 */
export const addServerCommand = new Command('add-server')
  .description('Add external MCP server to configuration')
  .argument('<endpoint>', 'MCP server endpoint URL')
  .option('-i, --id <id>', 'Server identifier')
  .option('-n, --namespace <namespace>', 'Tool namespace')
  .option('-d, --description <description>', 'Server description')
  .option('-t, --timeout <timeout>', 'Request timeout in milliseconds', val => parseInt(val, 10))
  .option('--auth-type <type>', 'Authentication type (bearer|basic|custom)')
  .option('--auth-token <token>', 'Bearer token or API key')
  .option('--auth-username <username>', 'Username for basic auth')
  .option('--auth-password <password>', 'Password for basic auth')
  .option('--test', 'Test connection before adding')
  .option('--include <tools...>', 'Include specific tools (glob patterns)')
  .option('--exclude <tools...>', 'Exclude specific tools (glob patterns)')
  .option('--rename <mapping>', 'Rename tools (format: old=new,old2=new2)')
  .option('--health-check', 'Enable health checks')
  .option('--interactive', 'Interactive configuration mode')
  .option('--dry', 'Show configuration changes without saving')
  .action((endpoint, options) => {
    // Parse rename mapping
    if (options.rename) {
      const pairs = options.rename.split(',')
      options.rename = {}
      for (const pair of pairs) {
        const [old, newName] = pair.split('=')
        if (old && newName) {
          options.rename[old.trim()] = newName.trim()
        }
      }
    }

    return handleAddServer(endpoint, options)
  })

// Add help examples
addServerCommand.on('--help', () => {
  console.log(`
Examples:
  # Basic server addition
  hatago add-server http://localhost:8080/mcp
  
  # With custom configuration
  hatago add-server http://localhost:8080/mcp \\
    --id my-server \\
    --namespace mytools \\
    --description "My custom MCP server"
  
  # With authentication
  hatago add-server https://api.example.com/mcp \\
    --auth-type bearer \\
    --auth-token "your-api-token"
  
  # With tool filtering
  hatago add-server http://localhost:8080/mcp \\
    --include "calc.*" "time.*" \\
    --exclude "debug.*" \\
    --rename "oldName=newName,tool1=myTool"
  
  # Interactive mode
  hatago add-server http://localhost:8080/mcp --interactive
  
  # Test connection and dry run
  hatago add-server http://localhost:8080/mcp --test --dry
`)
})
