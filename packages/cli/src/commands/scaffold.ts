import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type TemplateConfig, type TemplateContext, TemplateEngine } from '@hatago/config'
import { blue, cyan, gray, green, red, yellow } from 'colorette'
import { Command } from 'commander'
import { CLIError } from '../utils/error-handler.js'

/**
 * Scaffold options
 */
interface ScaffoldOptions {
  template?: string
  output?: string
  category?: string
  list?: boolean
  info?: boolean
  interactive?: boolean
  dry?: boolean
  force?: boolean
  context?: string
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
 * Get templates directory
 */
function getTemplatesDir(): string {
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

  throw new CLIError('Templates directory not found', 1)
}

/**
 * List available templates
 */
async function listTemplates(options: ScaffoldOptions): Promise<void> {
  const templatesDir = getTemplatesDir()
  const engine = new TemplateEngine()
  const templates = engine.listTemplates(templatesDir)

  if (process.env.HATAGO_JSON_OUTPUT === 'true') {
    outputResult({ templates })
    return
  }

  console.log(`\\n📚 ${cyan('Available Templates')}`)
  console.log('='.repeat(50))

  if (templates.length === 0) {
    console.log(`${yellow('No templates found')}`)
    return
  }

  // Group by category
  const categories = new Map<string, TemplateConfig[]>()
  for (const template of templates) {
    const category = template.category || 'other'
    if (!categories.has(category)) {
      categories.set(category, [])
    }
    categories.get(category)?.push(template)
  }

  // Filter by category if specified
  const categoriesToShow = options.category
    ? [options.category]
    : Array.from(categories.keys()).sort()

  for (const category of categoriesToShow) {
    const categoryTemplates = categories.get(category)
    if (!categoryTemplates || categoryTemplates.length === 0) {
      continue
    }

    console.log(`\\n${blue(`${category.toUpperCase()}:`)}`)
    for (const template of categoryTemplates) {
      const tags = template.tags?.length ? ` (${template.tags.join(', ')})` : ''
      console.log(`  ${green('•')} ${template.name}${tags}`)
      console.log(`    ${gray(template.description)}`)
    }
  }

  console.log(`\\n💡 Use ${cyan('hatago scaffold --info <template>')} for detailed information`)
  console.log(`💡 Use ${cyan('hatago scaffold <template> <name>')} to generate from template`)
}

/**
 * Show template information
 */
async function showTemplateInfo(templateName: string): Promise<void> {
  const templatesDir = getTemplatesDir()
  const engine = new TemplateEngine()

  const templateDir = engine.findTemplate(templatesDir, templateName)
  if (!templateDir) {
    throw new CLIError(`Template not found: ${templateName}`, 1)
  }

  const config = engine.loadTemplateConfig(templateDir)
  const validation = engine.validateTemplate(templateDir)

  if (process.env.HATAGO_JSON_OUTPUT === 'true') {
    outputResult({
      config,
      validation,
      templateDir,
    })
    return
  }

  console.log(`\\n📋 ${cyan('Template Information')}`)
  console.log('='.repeat(50))
  console.log(`Name: ${blue(config.displayName)}`)
  console.log(`ID: ${config.name}`)
  console.log(`Category: ${config.category}`)
  console.log(`Version: ${config.version}`)
  console.log(`Author: ${config.author}`)
  console.log(`Description: ${config.description}`)

  if (config.tags?.length) {
    console.log(`Tags: ${config.tags.join(', ')}`)
  }

  console.log('\\n📁 Files:')
  for (const file of config.files) {
    const optional = file.optional ? gray(' (optional)') : ''
    console.log(`  ${green('•')} ${file.output}${optional}`)
    console.log(`    ${gray(file.description)}`)
  }

  if (config.prompts?.length) {
    console.log('\\n❓ Configuration:')
    for (const prompt of config.prompts) {
      const required = prompt.required ? red(' *') : ''
      console.log(`  ${green('•')} ${prompt.name}${required} (${prompt.type})`)
      console.log(`    ${gray(prompt.message)}`)
    }
  }

  if (config.dependencies?.length) {
    console.log('\\n📦 Dependencies:')
    config.dependencies.forEach(dep => console.log(`  ${green('•')} ${dep}`))
  }

  if (config.devDependencies?.length) {
    console.log('\\n🔧 Dev Dependencies:')
    config.devDependencies.forEach(dep => console.log(`  ${green('•')} ${dep}`))
  }

  console.log(`\\n✅ Validation: ${validation.valid ? green('Valid') : red('Invalid')}`)
  if (!validation.valid) {
    validation.errors.forEach(error => console.log(`  ${red('•')} ${error}`))
  }

  console.log(`\\n💡 Usage: ${cyan(`hatago scaffold ${templateName} <name>`)}`)
}

/**
 * Interactive prompt for complex prompts
 */
async function interactivePrompt(prompts: unknown[]): Promise<TemplateContext> {
  const context: TemplateContext = {}
  const { createInterface } = require('node:readline')

  for (const promptItem of prompts) {
    const prompt = promptItem as { when?: string; [key: string]: unknown }
    if (prompt.when && !context[prompt.when]) {
      continue
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      switch (prompt.type) {
        case 'input': {
          const defaultText = prompt.default ? ` (${prompt.default})` : ''
          const answer = await new Promise<string>(resolve => {
            rl.question(`${prompt.message}${defaultText}: `, resolve)
          })
          context[prompt.name] = answer.trim() || prompt.default || ''
          break
        }

        case 'confirm': {
          const defaultConfirm = prompt.default ? 'Y/n' : 'y/N'
          const confirmAnswer = await new Promise<string>(resolve => {
            rl.question(`${prompt.message} (${defaultConfirm}): `, resolve)
          })
          const isYes =
            confirmAnswer.toLowerCase() === 'y' ||
            confirmAnswer.toLowerCase() === 'yes' ||
            (confirmAnswer === '' && prompt.default)
          context[prompt.name] = isYes
          break
        }

        case 'select':
          if (prompt.choices) {
            console.log(`\\n${prompt.message}`)
            prompt.choices.forEach((choice: string, index: number) => {
              console.log(`  ${index + 1}. ${choice}`)
            })
            const selectAnswer = await new Promise<string>(resolve => {
              rl.question('Select option: ', resolve)
            })
            const selectedIndex = Number.parseInt(selectAnswer, 10) - 1
            context[prompt.name] = prompt.choices[selectedIndex] || prompt.choices[0]
          }
          break

        default:
          console.log(`${yellow('Warning:')} Unsupported prompt type: ${prompt.type}`)
          context[prompt.name] = prompt.default
      }
    } finally {
      rl.close()
    }
  }

  return context
}

/**
 * Handle scaffold command
 */
async function handleScaffold(
  templateName?: string,
  outputName?: string,
  options: ScaffoldOptions = {}
): Promise<void> {
  try {
    // Handle list and info commands
    if (options.list) {
      return await listTemplates(options)
    }

    if (options.info && templateName) {
      return await showTemplateInfo(templateName)
    }

    if (!templateName) {
      return await listTemplates(options)
    }

    if (!outputName) {
      throw new CLIError('Output name is required when generating from template', 1)
    }

    const templatesDir = getTemplatesDir()
    const engine = new TemplateEngine()

    if (process.env.HATAGO_JSON_OUTPUT === 'true') {
      outputResult({
        action: 'scaffold',
        template: templateName,
        output: outputName,
        templatesDir,
        options,
      })
      return
    }

    console.log(`\\n🏗️  ${cyan('Scaffolding from Template')}`)
    console.log('='.repeat(40))

    // Find template
    const templateDir = engine.findTemplate(templatesDir, templateName)
    if (!templateDir) {
      throw new CLIError(`Template not found: ${templateName}`, 1)
    }

    // Validate template
    const validation = engine.validateTemplate(templateDir)
    if (!validation.valid) {
      throw new CLIError(`Invalid template: ${validation.errors.join(', ')}`, 1)
    }

    // Load template configuration
    const config = engine.loadTemplateConfig(templateDir)

    console.log(`📋 Template: ${blue(config.displayName)}`)
    console.log(`📝 Output: ${outputName}`)

    // Determine output directory
    const outputDir = resolve(options.output || '.')
    console.log(`📂 Directory: ${outputDir}`)

    // Check if output already exists
    const outputPath = join(outputDir, outputName)
    if (existsSync(outputPath) && !options.force) {
      throw new CLIError(`Output already exists: ${outputPath}\\nUse --force to overwrite`, 1)
    }

    // Build template context
    let context: TemplateContext = {
      name: outputName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      author: 'Anonymous',
      description: `Generated ${outputName}`,
    }

    // Load context from file if provided
    if (options.context && existsSync(options.context)) {
      try {
        const contextFile = require('node:fs').readFileSync(options.context, 'utf-8')
        const fileContext = JSON.parse(contextFile)
        context = { ...context, ...fileContext }
      } catch (error) {
        console.log(`${yellow('Warning:')} Failed to load context file: ${error}`)
      }
    }

    // Interactive configuration
    if (options.interactive && config.prompts?.length) {
      console.log(`\\n🔧 ${yellow('Interactive Configuration')}`)
      const userContext = await interactivePrompt(config.prompts)
      context = { ...context, ...userContext }
    }

    // Generate files
    console.log(`\\n🔨 ${yellow('Generating files...')}`)

    const result = engine.generateFromTemplate(templateDir, outputDir, context, {
      includeOptional: true,
      dryRun: options.dry,
    })

    // Show results
    if (options.dry) {
      console.log(`\\n${yellow('📋')} Dry run - files not created:`)
      result.files.forEach(file => {
        console.log(`   ${gray('•')} ${file.path}`)
      })
    } else {
      console.log(`\\n${green('✅')} Generated successfully:`)
      result.files.forEach(file => {
        console.log(`   ${green('✓')} ${file.path}`)
      })

      // Show next steps
      console.log('\\n🎯 Next steps:')
      console.log(`   1. Review generated files in: ${outputPath}`)

      if (config.dependencies?.length) {
        console.log(`   2. Install dependencies: pnpm install ${config.dependencies.join(' ')}`)
      }

      if (config.category === 'plugins') {
        console.log('   3. Register plugin in your Hatago server')
        console.log('   4. Start development server: hatago dev')
      }
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error
    }
    throw new CLIError(`Scaffolding failed: ${error}`, 1)
  }
}

/**
 * Create scaffold command
 */
export const scaffoldCommand = new Command('scaffold')
  .description('Generate code from templates')
  .argument('[template]', 'Template name to use')
  .argument('[name]', 'Name for the generated output')
  .option('-t, --template <name>', 'Template name (alternative to positional argument)')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-c, --category <category>', 'Filter templates by category')
  .option('-l, --list', 'List available templates')
  .option('--info', 'Show detailed template information')
  .option('-i, --interactive', 'Interactive configuration mode')
  .option('--context <file>', 'Load context from JSON file')
  .option('--dry', 'Show what would be generated without creating files')
  .option('-f, --force', 'Overwrite existing files')
  .action(handleScaffold)

// Add help examples
scaffoldCommand.on('--help', () => {
  console.log(`
Examples:
  # List all templates
  hatago scaffold --list
  
  # List templates by category
  hatago scaffold --list --category plugins
  
  # Show template information
  hatago scaffold --info basic
  
  # Generate from template
  hatago scaffold basic my-plugin
  
  # Interactive mode
  hatago scaffold basic my-plugin --interactive
  
  # Custom output directory
  hatago scaffold basic my-plugin --output ./plugins
  
  # Use context file
  hatago scaffold basic my-plugin --context ./config.json
  
  # Dry run to preview
  hatago scaffold basic my-plugin --dry
`)
})
