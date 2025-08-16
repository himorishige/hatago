import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type TemplateConfig, type TemplateContext, TemplateEngine } from '@hatago/config'
import { blue, cyan, gray, green, red, yellow } from 'colorette'
import { Command } from 'commander'
import { CLIError } from '../utils/error-handler.js'

/**
 * Create plugin options
 */
interface CreatePluginOptions {
  template?: string
  output?: string
  interactive?: boolean
  dry?: boolean
  includeTests?: boolean
  includeReadme?: boolean
  force?: boolean
}

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
 * Prompt for user input (simplified version)
 */
async function promptInput(question: string, defaultValue?: string): Promise<string> {
  return new Promise(resolve => {
    const { createInterface } = require('node:readline')
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
 * Prompt for confirmation
 */
async function promptConfirm(question: string, defaultValue = false): Promise<boolean> {
  const answer = await promptInput(
    `${question} (${defaultValue ? 'Y/n' : 'y/N'})`,
    defaultValue ? 'y' : 'n'
  )
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

/**
 * Prompt for selection
 */
async function promptSelect(
  question: string,
  choices: string[],
  defaultValue?: string
): Promise<string> {
  console.log(`\\n${question}`)
  choices.forEach((choice, index) => {
    const marker = choice === defaultValue ? '>' : ' '
    console.log(`${marker} ${index + 1}. ${choice}`)
  })

  const answer = await promptInput(
    'Select option',
    defaultValue ? String(choices.indexOf(defaultValue) + 1) : '1'
  )
  const index = Number.parseInt(answer, 10) - 1

  if (index >= 0 && index < choices.length) {
    return choices[index]!
  }

  return defaultValue ?? choices[0] ?? ''
}

/**
 * Interactive prompt for template configuration
 */
async function interactivePrompt(templateConfig: TemplateConfig): Promise<TemplateContext> {
  const context: TemplateContext = {}

  console.log(`\\n🔧 ${cyan('Interactive Plugin Configuration')}`)
  console.log('='.repeat(50))
  console.log(`Template: ${blue(templateConfig.displayName)}`)
  console.log(`Description: ${gray(templateConfig.description)}`)
  console.log('')

  for (const prompt of templateConfig.prompts) {
    // Skip conditional prompts if condition not met
    if (prompt.when && !context[prompt.when]) {
      continue
    }

    try {
      switch (prompt.type) {
        case 'input':
          context[prompt.name] = await promptInput(prompt.message, prompt.default)
          break

        case 'confirm':
          context[prompt.name] = await promptConfirm(prompt.message, prompt.default)
          break

        case 'select':
          if (!prompt.choices) {
            throw new Error(`Select prompt '${prompt.name}' must have choices`)
          }
          context[prompt.name] = await promptSelect(prompt.message, prompt.choices, prompt.default)
          break

        case 'array': {
          if (!prompt.itemPrompts) {
            context[prompt.name] = []
            break
          }

          const items: Record<string, unknown>[] = []
          let addMore = true

          console.log(`\\n${prompt.message}`)

          while (addMore) {
            const item: Record<string, unknown> = {}

            console.log(`\\n  Adding item ${items.length + 1}:`)

            for (const itemPrompt of prompt.itemPrompts) {
              switch (itemPrompt.type) {
                case 'input':
                  item[itemPrompt.name] = await promptInput(
                    `    ${itemPrompt.message}`,
                    itemPrompt.default
                  )
                  if (itemPrompt.required && !item[itemPrompt.name]) {
                    console.log(`    ${red('Error:')} ${itemPrompt.message} is required`)
                    item[itemPrompt.name] = await promptInput(`    ${itemPrompt.message}`)
                  }
                  break

                case 'select':
                  if (itemPrompt.choices) {
                    item[itemPrompt.name] = await promptSelect(
                      `    ${itemPrompt.message}`,
                      itemPrompt.choices,
                      itemPrompt.default
                    )
                  }
                  break

                case 'confirm':
                  item[itemPrompt.name] = await promptConfirm(
                    `    ${itemPrompt.message}`,
                    itemPrompt.default
                  )
                  break
              }
            }

            items.push(item)
            addMore = await promptConfirm('  Add another item?', false)
          }

          context[prompt.name] = items
          break
        }

        default:
          console.log(`${yellow('Warning:')} Unknown prompt type: ${prompt.type}`)
      }
    } catch (error) {
      console.error(`${red('Error:')} Failed to process prompt '${prompt.name}': ${error}`)
    }
  }

  return context
}

/**
 * Get templates directory
 */
function getTemplatesDir(): string {
  // Try to find templates directory
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const possiblePaths = [
    resolve('templates'),
    resolve('node_modules/@hatago/templates'),
    resolve(__dirname, '../../../templates'),
    resolve(__dirname, '../../../../templates'),
  ]

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path
    }
  }

  throw new CLIError(
    'Templates directory not found. Make sure you are in a Hatago project or have templates installed.',
    1
  )
}

/**
 * Handle create-plugin command
 */
async function handleCreatePlugin(pluginName: string, options: CreatePluginOptions): Promise<void> {
  try {
    if (!pluginName) {
      throw new CLIError('Plugin name is required', 1)
    }

    // Validate plugin name
    if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(pluginName)) {
      throw new CLIError(
        'Plugin name must start with a letter and contain only letters, numbers, hyphens, and underscores',
        1
      )
    }

    const templatesDir = getTemplatesDir()
    const engine = new TemplateEngine()

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        action: 'create-plugin',
        pluginName,
        templatesDir,
        options,
      })
      return
    }

    console.log(`\\n🔌 ${cyan('Creating Hatago Plugin')}`)
    console.log('='.repeat(40))

    // List available templates if no template specified
    if (!options.template) {
      const templates = engine.listTemplates(templatesDir)
      const pluginTemplates = templates.filter(t => t.category === 'plugins')

      if (pluginTemplates.length === 0) {
        throw new CLIError('No plugin templates found', 1)
      }

      if (options.interactive && pluginTemplates.length > 1) {
        const choices = pluginTemplates.map(t => `${t.name} - ${t.description}`)
        const selected = await promptSelect('Choose a template:', choices)
        options.template = pluginTemplates[choices.indexOf(selected)]?.name ?? ''
      } else {
        options.template = pluginTemplates[0]?.name ?? ''
      }
    }

    // Find template
    const templateDir = engine.findTemplate(templatesDir, options.template)
    if (!templateDir) {
      throw new CLIError(`Template not found: ${options.template}`, 1)
    }

    // Validate template
    const validation = engine.validateTemplate(templateDir)
    if (!validation.valid) {
      throw new CLIError(`Invalid template: ${validation.errors.join(', ')}`, 1)
    }

    // Load template configuration
    const templateConfig = engine.loadTemplateConfig(templateDir)

    console.log(`📋 Template: ${blue(templateConfig.displayName)}`)
    console.log(`📝 Description: ${templateConfig.description}`)

    // Determine output directory
    const outputDir = resolve(options.output || join('src', 'plugins'))
    console.log(`📂 Output: ${outputDir}`)

    // Check if plugin already exists
    const pluginPath = join(outputDir, `${pluginName}.ts`)
    if (existsSync(pluginPath) && !options.force) {
      throw new CLIError(`Plugin already exists: ${pluginPath}\\nUse --force to overwrite`, 1)
    }

    // Build template context
    let context: TemplateContext = {
      name: pluginName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      author: 'Anonymous',
      description: `${pluginName} plugin for Hatago`,
    }

    // Interactive configuration
    if (options.interactive) {
      const userContext = await interactivePrompt(templateConfig)
      context = { ...context, ...userContext }
    }

    // Filter optional files
    const includeOptional = {
      tests: options.includeTests !== false,
      readme: options.includeReadme !== false,
    }

    // Generate files
    console.log(`\\n🔨 ${yellow('Generating plugin files...')}`)

    const result = engine.generateFromTemplate(templateDir, outputDir, context, {
      includeOptional: true,
      dryRun: options.dry ?? false,
    })

    // Filter files based on options
    const filteredFiles = result.files.filter(file => {
      if (file.path.includes('.test.') && !includeOptional.tests) {
        return false
      }
      if (file.path.includes('README.md') && !includeOptional.readme) {
        return false
      }
      return true
    })

    // Show results
    if (options.dry) {
      console.log(`\\n${yellow('📋')} Dry run - files not created:`)
      filteredFiles.forEach(file => {
        console.log(`   ${gray('•')} ${file.path}`)
      })
    } else {
      console.log(`\\n${green('✅')} Plugin created successfully:`)
      filteredFiles.forEach(file => {
        console.log(`   ${green('✓')} ${file.path}`)
      })

      // Show next steps
      console.log('\\n🎯 Next steps:')
      console.log(`   1. Review the generated plugin: ${pluginPath}`)
      console.log(
        `   2. Register plugin in your server: import { ${context.name}Plugin } from './plugins/${pluginName}.js'`
      )
      console.log('   3. Add to plugins array in createHatagoApp()')
      console.log('   4. Start development server: hatago dev')

      if (includeOptional.tests) {
        console.log(`   5. Run tests: pnpm test ${pluginName}`)
      }
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error
    }
    throw new CLIError(`Failed to create plugin: ${error}`, 1)
  }
}

/**
 * Create create-plugin command
 */
export const createPluginCommand = new Command('create-plugin')
  .description('Create a new Hatago plugin from template')
  .argument('<plugin-name>', 'Name of the plugin to create')
  .option('-t, --template <name>', 'Template name to use')
  .option('-o, --output <dir>', 'Output directory', 'src/plugins')
  .option('-i, --interactive', 'Interactive configuration mode')
  .option('--dry', 'Show what would be created without actually creating files')
  .option('--no-tests', 'Skip test file generation')
  .option('--no-readme', 'Skip README file generation')
  .option('-f, --force', 'Overwrite existing plugin')
  .action(handleCreatePlugin)

// Add help examples
createPluginCommand.on('--help', () => {
  console.log(`
Examples:
  # Create basic plugin
  hatago create-plugin my-tool
  
  # Interactive mode with custom template
  hatago create-plugin my-tool --template basic --interactive
  
  # Custom output directory
  hatago create-plugin my-tool --output plugins/
  
  # Dry run to preview
  hatago create-plugin my-tool --dry
  
  # Skip optional files
  hatago create-plugin my-tool --no-tests --no-readme
  
  # Force overwrite existing plugin
  hatago create-plugin my-tool --force
`)
})
