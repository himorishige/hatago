import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Handlebars from 'handlebars'

/**
 * Template configuration interface
 */
export interface TemplateConfig {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  author: string
  version: string
  files: TemplateFile[]
  prompts: TemplatePrompt[]
  dependencies?: string[]
  devDependencies?: string[]
}

/**
 * Template file configuration
 */
export interface TemplateFile {
  template: string
  output: string
  description: string
  optional?: boolean
}

/**
 * Template prompt configuration
 */
export interface TemplatePrompt {
  name: string
  type: 'input' | 'confirm' | 'select' | 'array'
  message: string
  default?: any
  choices?: string[]
  when?: string
  required?: boolean
  itemPrompts?: TemplatePrompt[]
}

/**
 * Template rendering context
 */
export interface TemplateContext {
  [key: string]: any
}

/**
 * Template generation result
 */
export interface TemplateResult {
  files: GeneratedFile[]
  context: TemplateContext
}

/**
 * Generated file information
 */
export interface GeneratedFile {
  path: string
  content: string
  optional: boolean
}

/**
 * Template engine instance interface
 */
interface TemplateEngineInstance {
  loadTemplateConfig(templateDir: string): TemplateConfig
  renderTemplate(templatePath: string, context: TemplateContext): string
  generateFromTemplate(
    templateDir: string,
    outputDir: string,
    context: TemplateContext,
    options?: {
      includeOptional?: boolean
      dryRun?: boolean
    }
  ): TemplateResult
  listTemplates(templatesDir: string): TemplateConfig[]
  findTemplate(templatesDir: string, name: string): string | null
  validateTemplate(templateDir: string): { valid: boolean; errors: string[] }
  createTemplate(
    templateDir: string,
    config: Partial<TemplateConfig>,
    files: { [filename: string]: string }
  ): void
}

/**
 * Create a template engine instance
 */
export function createTemplateEngine(): TemplateEngineInstance {
  const handlebars = Handlebars.create()

  /**
   * Register custom Handlebars helpers
   */
  const registerHelpers = (): void => {
    // String transformation helpers
    handlebars.registerHelper('camelCase', (str: string) => {
      return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
          return index === 0 ? word.toLowerCase() : word.toUpperCase()
        })
        .replace(/\s+/g, '')
    })

    handlebars.registerHelper('kebabCase', (str: string) => {
      return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase()
    })

    handlebars.registerHelper('snakeCase', (str: string) => {
      return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/\s+/g, '_')
        .toLowerCase()
    })

    handlebars.registerHelper('titleCase', (str: string) => {
      return str.replace(/\w\S*/g, txt => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      })
    })

    handlebars.registerHelper('toUpperCase', (str: string) => {
      return str.toUpperCase()
    })

    handlebars.registerHelper('toLowerCase', (str: string) => {
      return str.toLowerCase()
    })

    // Date helpers
    handlebars.registerHelper('timestamp', () => {
      return new Date().toISOString()
    })

    handlebars.registerHelper('date', (format?: string) => {
      const date = new Date()
      if (format === 'short') {
        return date.toLocaleDateString()
      }
      return date.toISOString().split('T')[0]
    })

    // Conditional helpers
    handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b
    })

    handlebars.registerHelper('ne', (a: any, b: any) => {
      return a !== b
    })

    handlebars.registerHelper('gt', (a: number, b: number) => {
      return a > b
    })

    handlebars.registerHelper('lt', (a: number, b: number) => {
      return a < b
    })

    // Array helpers
    handlebars.registerHelper('length', (array: any[]) => {
      return Array.isArray(array) ? array.length : 0
    })

    handlebars.registerHelper('join', (array: any[], separator = ', ') => {
      return Array.isArray(array) ? array.join(separator) : ''
    })

    // JSON helper
    handlebars.registerHelper('json', (obj: any, indent = 2) => {
      return JSON.stringify(obj, null, indent)
    })
  }

  // Initialize helpers
  registerHelpers()

  /**
   * Load template configuration from directory
   */
  const loadTemplateConfig = (templateDir: string): TemplateConfig => {
    const configPath = join(templateDir, 'template.config.json')

    if (!existsSync(configPath)) {
      throw new Error(`Template configuration not found: ${configPath}`)
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8')
      return JSON.parse(configContent)
    } catch (error) {
      throw new Error(`Failed to parse template configuration: ${error}`)
    }
  }

  /**
   * Render template with context
   */
  const renderTemplate = (templatePath: string, context: TemplateContext): string => {
    if (!existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`)
    }

    try {
      const templateContent = readFileSync(templatePath, 'utf-8')
      const template = handlebars.compile(templateContent)
      return template(context)
    } catch (error) {
      throw new Error(`Failed to render template ${templatePath}: ${error}`)
    }
  }

  /**
   * Generate files from template
   */
  const generateFromTemplate = (
    templateDir: string,
    outputDir: string,
    context: TemplateContext,
    options: {
      includeOptional?: boolean
      dryRun?: boolean
    } = {}
  ): TemplateResult => {
    const { includeOptional = true, dryRun = false } = options

    const config = loadTemplateConfig(templateDir)
    const files: GeneratedFile[] = []

    // Process each template file
    for (const fileConfig of config.files) {
      if (!includeOptional && fileConfig.optional) {
        continue
      }

      const templatePath = join(templateDir, fileConfig.template)
      const outputPathTemplate = handlebars.compile(fileConfig.output)
      const outputPath = outputPathTemplate(context)
      const resolvedOutputPath = join(outputDir, outputPath)

      try {
        const renderedContent = renderTemplate(templatePath, context)

        files.push({
          path: resolvedOutputPath,
          content: renderedContent,
          optional: fileConfig.optional || false,
        })

        if (!dryRun) {
          // Ensure output directory exists
          const fileDir = dirname(resolvedOutputPath)
          mkdirSync(fileDir, { recursive: true })

          // Write file
          writeFileSync(resolvedOutputPath, renderedContent, 'utf-8')
        }
      } catch (error) {
        throw new Error(`Failed to generate file ${fileConfig.output}: ${error}`)
      }
    }

    return {
      files,
      context,
    }
  }

  /**
   * List available templates
   */
  const listTemplates = (templatesDir: string): TemplateConfig[] => {
    const templates: TemplateConfig[] = []

    if (!existsSync(templatesDir)) {
      return templates
    }

    const categories = ['plugins', 'projects', 'examples']

    for (const category of categories) {
      const categoryDir = join(templatesDir, category)
      if (!existsSync(categoryDir)) continue

      try {
        const entries = readdirSync(categoryDir, { withFileTypes: true })

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const templateDir = join(categoryDir, entry.name)
            try {
              const config = loadTemplateConfig(templateDir)
              config.category = category
              templates.push(config)
            } catch {
              // Skip invalid templates
            }
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    return templates
  }

  /**
   * Find template by name
   */
  const findTemplate = (templatesDir: string, name: string): string | null => {
    const templates = listTemplates(templatesDir)
    const template = templates.find(t => t.name === name)

    if (template) {
      return join(templatesDir, template.category, template.name)
    }

    return null
  }

  /**
   * Validate template directory
   */
  const validateTemplate = (templateDir: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    try {
      const config = loadTemplateConfig(templateDir)

      // Validate required fields
      if (!config.name) errors.push('Template name is required')
      if (!config.displayName) errors.push('Template displayName is required')
      if (!config.description) errors.push('Template description is required')
      if (!config.files || config.files.length === 0) {
        errors.push('Template must have at least one file')
      }

      // Validate template files exist
      for (const file of config.files || []) {
        const templatePath = join(templateDir, file.template)
        if (!existsSync(templatePath)) {
          errors.push(`Template file not found: ${file.template}`)
        }
      }
    } catch (error) {
      errors.push(`Invalid template configuration: ${error}`)
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Create a new template
   */
  const createTemplate = (
    templateDir: string,
    config: Partial<TemplateConfig>,
    files: { [filename: string]: string }
  ): void => {
    // Ensure template directory exists
    mkdirSync(templateDir, { recursive: true })

    // Write template configuration
    const fullConfig: TemplateConfig = {
      name: 'custom-template',
      displayName: 'Custom Template',
      description: 'A custom template',
      category: 'custom',
      tags: [],
      author: 'Anonymous',
      version: '1.0.0',
      files: [],
      prompts: [],
      ...config,
    }

    writeFileSync(
      join(templateDir, 'template.config.json'),
      JSON.stringify(fullConfig, null, 2),
      'utf-8'
    )

    // Write template files
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(templateDir, filename), content, 'utf-8')
    }
  }

  return {
    loadTemplateConfig,
    renderTemplate,
    generateFromTemplate,
    listTemplates,
    findTemplate,
    validateTemplate,
    createTemplate,
  }
}

/**
 * Legacy class wrapper for backward compatibility
 * @deprecated Use createTemplateEngine() instead
 */
export class TemplateEngine {
  private engine: TemplateEngineInstance

  constructor() {
    this.engine = createTemplateEngine()
  }

  loadTemplateConfig(templateDir: string): TemplateConfig {
    return this.engine.loadTemplateConfig(templateDir)
  }

  renderTemplate(templatePath: string, context: TemplateContext): string {
    return this.engine.renderTemplate(templatePath, context)
  }

  generateFromTemplate(
    templateDir: string,
    outputDir: string,
    context: TemplateContext,
    options: {
      includeOptional?: boolean
      dryRun?: boolean
    } = {}
  ): TemplateResult {
    return this.engine.generateFromTemplate(templateDir, outputDir, context, options)
  }

  listTemplates(templatesDir: string): TemplateConfig[] {
    return this.engine.listTemplates(templatesDir)
  }

  findTemplate(templatesDir: string, name: string): string | null {
    return this.engine.findTemplate(templatesDir, name)
  }

  validateTemplate(templateDir: string): { valid: boolean; errors: string[] } {
    return this.engine.validateTemplate(templateDir)
  }

  createTemplate(
    templateDir: string,
    config: Partial<TemplateConfig>,
    files: { [filename: string]: string }
  ): void {
    return this.engine.createTemplate(templateDir, config, files)
  }
}
