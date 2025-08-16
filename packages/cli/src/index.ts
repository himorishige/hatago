#!/usr/bin/env node

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Command } from 'commander'
import { addServerCommand } from './commands/add-server.js'
import { configCommand } from './commands/config.js'
import { createPluginCommand } from './commands/create-plugin.js'
import { devCommand } from './commands/dev.js'
import { initCommand } from './commands/init.js'
import { scaffoldCommand } from './commands/scaffold.js'
import { setupErrorHandling } from './utils/error-handler.js'
import { checkForUpdates } from './utils/update-checker.js'

// Setup error handling first
setupErrorHandling()

// Get package.json info
const __dirname = dirname(fileURLToPath(import.meta.url))
const packagePath = join(__dirname, '../package.json')
const packageInfo = JSON.parse(readFileSync(packagePath, 'utf-8'))

// Create main program
const program = new Command()

program
  .name('hatago')
  .description('Command line interface for Hatago MCP server')
  .version(packageInfo.version)
  .option('-v, --verbose', 'Enable verbose output')
  .option('--json', 'Output in JSON format')

// Add commands
program.addCommand(configCommand)
program.addCommand(initCommand)
program.addCommand(devCommand)
program.addCommand(addServerCommand)
program.addCommand(createPluginCommand)
program.addCommand(scaffoldCommand)

// Global options handling
program.hook('preAction', thisCommand => {
  const opts = thisCommand.optsWithGlobals()

  // Set global verbose flag
  if (opts.verbose) {
    process.env.HATAGO_VERBOSE = 'true'
  }

  // Set global JSON output flag
  if (opts.json) {
    process.env.HATAGO_JSON_OUTPUT = 'true'
  }
})

// Check for updates (async, don't block)
if (process.env.NODE_ENV !== 'test') {
  checkForUpdates(packageInfo.name, packageInfo.version)
}

// Parse command line arguments
program.parse()

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
