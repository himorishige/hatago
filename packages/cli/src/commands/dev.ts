import { type ChildProcess, spawn } from 'child_process'
import { watch } from 'fs'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { type HatagoConfig, loadConfig } from '@hatago/config'
import { blue, cyan, gray, green, red, yellow } from 'colorette'
import { Command } from 'commander'
import { CLIError } from '../utils/error-handler.js'

/**
 * Development server options
 */
interface DevOptions {
  port?: number
  hostname?: string
  watch?: string[]
  verbose?: boolean
  inspect?: boolean
  inspectPort?: number
  clearScreen?: boolean
  open?: boolean
}

/**
 * Development server state
 */
interface DevServer {
  process: ChildProcess | null
  config: HatagoConfig
  isRestarting: boolean
  startTime: number
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
 * Clear screen if enabled
 */
function clearScreen(enabled: boolean): void {
  if (enabled && process.stdout.isTTY) {
    process.stdout.write('\\x1b[2J\\x1b[0f')
  }
}

/**
 * Format timestamp
 */
function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

/**
 * Log with timestamp
 */
function logWithTime(message: string, color = gray): void {
  console.log(`${color(`[${formatTime()}]`)} ${message}`)
}

/**
 * Find TypeScript compiler
 */
function findTscCommand(): string {
  const tscPaths = ['node_modules/.bin/tsc', 'pnpm exec tsc', 'npx tsc', 'tsc']

  for (const tscPath of tscPaths) {
    try {
      if (tscPath.includes('/')) {
        if (existsSync(tscPath)) return tscPath
      } else {
        // Global command
        return tscPath
      }
    } catch {
      continue
    }
  }

  return 'npx tsc'
}

/**
 * Build project
 */
async function buildProject(verbose: boolean): Promise<boolean> {
  return new Promise(resolve => {
    const tscCommand = findTscCommand()
    const args = tscCommand.split(' ')
    const cmd = args.shift()!

    if (verbose) {
      logWithTime(`Building with: ${tscCommand}`, cyan)
    }

    const buildProcess = spawn(cmd, args, {
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true,
    })

    buildProcess.on('close', code => {
      resolve(code === 0)
    })

    buildProcess.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * Start server process
 */
function startServer(devServer: DevServer, options: DevOptions): void {
  const { config } = devServer
  const port = options.port || config.server?.port || 8787
  const hostname = options.hostname || config.server?.hostname || 'localhost'

  // Prepare Node.js arguments
  const nodeArgs: string[] = []

  if (options.inspect) {
    const inspectPort = options.inspectPort || 9229
    nodeArgs.push(`--inspect=${inspectPort}`)
  }

  // Check if dist/index.js exists
  const serverScript = resolve('dist/index.js')
  if (!existsSync(serverScript)) {
    throw new CLIError(
      `Server script not found: ${serverScript}\\nRun build first or check your TypeScript configuration`,
      1
    )
  }

  nodeArgs.push(serverScript)

  devServer.process = spawn('node', nodeArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      NODE_ENV: 'development',
      HATAGO_DEV: 'true',
    },
  })

  devServer.startTime = Date.now()

  devServer.process.on('close', code => {
    if (!devServer.isRestarting) {
      if (code === 0) {
        logWithTime('Server stopped', yellow)
      } else {
        logWithTime(`Server exited with code ${code}`, red)
      }
    }
  })

  devServer.process.on('error', error => {
    logWithTime(`Server error: ${error.message}`, red)
  })

  const startupTime = Date.now() - devServer.startTime
  logWithTime(`🚀 Server started in ${startupTime}ms`, green)
  logWithTime(`📋 Health: http://${hostname}:${port}/health`, cyan)
  logWithTime(`🔌 MCP: http://${hostname}:${port}/mcp`, cyan)
}

/**
 * Stop server process
 */
function stopServer(devServer: DevServer): Promise<void> {
  return new Promise(resolve => {
    if (!devServer.process) {
      resolve()
      return
    }

    devServer.process.on('close', () => {
      devServer.process = null
      resolve()
    })

    devServer.process.kill('SIGTERM')

    // Force kill after 5 seconds
    setTimeout(() => {
      if (devServer.process) {
        devServer.process.kill('SIGKILL')
        devServer.process = null
        resolve()
      }
    }, 5000)
  })
}

/**
 * Restart server
 */
async function restartServer(devServer: DevServer, options: DevOptions): Promise<void> {
  devServer.isRestarting = true

  logWithTime('🔄 Restarting server...', yellow)

  await stopServer(devServer)

  // Build project
  const buildSuccess = await buildProject(options.verbose || false)
  if (!buildSuccess) {
    logWithTime('❌ Build failed, keeping previous version', red)
    devServer.isRestarting = false
    return
  }

  startServer(devServer, options)
  devServer.isRestarting = false
}

/**
 * Setup file watcher
 */
function setupWatcher(devServer: DevServer, options: DevOptions): void {
  const watchPaths = options.watch || ['src']

  for (const watchPath of watchPaths) {
    if (!existsSync(watchPath)) {
      logWithTime(`⚠️  Watch path not found: ${watchPath}`, yellow)
      continue
    }

    logWithTime(`👀 Watching: ${watchPath}`, gray)

    const watcher = watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      // Ignore non-source files
      if (!filename.endsWith('.ts') && !filename.endsWith('.js') && !filename.endsWith('.json')) {
        return
      }

      // Ignore node_modules and dist
      if (filename.includes('node_modules') || filename.includes('dist')) {
        return
      }

      logWithTime(`📝 Changed: ${filename}`, gray)

      // Debounce restarts
      clearTimeout((restartServer as any).timeout)
      ;(restartServer as any).timeout = setTimeout(() => {
        restartServer(devServer, options)
      }, 300)
    })

    // Handle process exit
    process.on('SIGINT', () => {
      watcher.close()
    })
  }
}

/**
 * Open browser
 */
function openBrowser(url: string): void {
  const startCommand =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'

  spawn(startCommand, [url], { stdio: 'ignore' })
}

/**
 * Handle dev command
 */
async function handleDev(options: DevOptions): Promise<void> {
  try {
    // Load configuration
    const { config, filepath } = await loadConfig()

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        action: 'dev-start',
        configPath: filepath,
        config: {
          port: options.port || config.server?.port || 8787,
          hostname: options.hostname || config.server?.hostname || 'localhost',
        },
        watch: options.watch || ['src'],
      })
      return
    }

    clearScreen(options.clearScreen !== false)

    console.log(`\\n🔥 ${cyan('Hatago Development Server')}`)
    console.log('='.repeat(50))

    if (filepath) {
      logWithTime(`📋 Config: ${filepath}`, gray)
    } else {
      logWithTime('📋 Using default configuration', gray)
    }

    // Initialize dev server state
    const devServer: DevServer = {
      process: null,
      config,
      isRestarting: false,
      startTime: 0,
    }

    // Build project first
    logWithTime('🔨 Building project...', cyan)
    const buildSuccess = await buildProject(options.verbose || false)

    if (!buildSuccess) {
      throw new CLIError('Initial build failed', 1)
    }

    // Start server
    startServer(devServer, options)

    // Setup file watching
    setupWatcher(devServer, options)

    // Open browser if requested
    if (options.open) {
      const hostname = options.hostname || config.server?.hostname || 'localhost'
      const port = options.port || config.server?.port || 8787
      const url = `http://${hostname}:${port}/health`

      setTimeout(() => {
        openBrowser(url)
        logWithTime(`🌐 Opened browser: ${url}`, cyan)
      }, 1000)
    }

    logWithTime('✅ Development server ready', green)

    if (options.inspect) {
      const inspectPort = options.inspectPort || 9229
      logWithTime(`🔍 Debugger: chrome://inspect (port ${inspectPort})`, blue)
    }

    console.log(`\\n${gray('Press Ctrl+C to stop the server')}`)

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(`\\n\\n${yellow('🛑 Shutting down development server...')}`)
      await stopServer(devServer)
      console.log(`${green('✅')} Server stopped`)
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await stopServer(devServer)
      process.exit(0)
    })
  } catch (error) {
    if (error instanceof CLIError) {
      throw error
    }
    throw new CLIError(`Development server failed: ${error}`, 1)
  }
}

/**
 * Create dev command
 */
export const devCommand = new Command('dev')
  .description('Start development server with hot reload')
  .option('-p, --port <port>', 'Server port', val => Number.parseInt(val, 10))
  .option('-H, --hostname <hostname>', 'Server hostname')
  .option('-w, --watch <paths...>', 'Additional paths to watch for changes')
  .option('--inspect', 'Enable Node.js inspector for debugging')
  .option('--inspect-port <port>', 'Inspector port', val => Number.parseInt(val, 10), 9229)
  .option('--no-clear-screen', 'Disable clearing screen on restart')
  .option('--open', 'Open browser after server starts')
  .action(handleDev)

// Add help examples
devCommand.on('--help', () => {
  console.log(`
Examples:
  hatago dev                              Start development server
  hatago dev --port 3000                 Start on custom port
  hatago dev --hostname 0.0.0.0          Listen on all interfaces
  hatago dev --watch src --watch config  Watch additional directories
  hatago dev --inspect                   Enable debugging
  hatago dev --open                      Open browser automatically
`)
})
