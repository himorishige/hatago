import Handlebars from 'handlebars'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, join, dirname } from 'path'

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
 * Template engine class
 */
export class TemplateEngine {
  private handlebars: typeof Handlebars

  constructor() {
    this.handlebars = Handlebars.create()
    this.registerHelpers()
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    // String transformation helpers
    this.handlebars.registerHelper('camelCase', (str: string) => {
      return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
          return index === 0 ? word.toLowerCase() : word.toUpperCase()
        })
        .replace(/\s+/g, '')
    })

    this.handlebars.registerHelper('kebabCase', (str: string) => {
      return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase()
    })

    this.handlebars.registerHelper('snakeCase', (str: string) => {
      return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/\s+/g, '_')
        .toLowerCase()
    })

    this.handlebars.registerHelper('titleCase', (str: string) => {
      return str.replace(/\w\S*/g, txt => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      })
    })

    this.handlebars.registerHelper('toUpperCase', (str: string) => {
      return str.toUpperCase()
    })

    this.handlebars.registerHelper('toLowerCase', (str: string) => {
      return str.toLowerCase()
    })

    // Date helpers
    this.handlebars.registerHelper('timestamp', () => {
      return new Date().toISOString()
    })

    this.handlebars.registerHelper('date', (format?: string) => {
      const date = new Date()
      if (format === 'short') {
        return date.toLocaleDateString()
      }
      return date.toISOString().split('T')[0]
    })

    // Conditional helpers
    this.handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b
    })

    this.handlebars.registerHelper('ne', (a: any, b: any) => {
      return a !== b
    })

    this.handlebars.registerHelper('gt', (a: number, b: number) => {
      return a > b
    })

    this.handlebars.registerHelper('lt', (a: number, b: number) => {
      return a < b
    })

    // Array helpers
    this.handlebars.registerHelper('length', (array: any[]) => {
      return Array.isArray(array) ? array.length : 0
    })

    this.handlebars.registerHelper('join', (array: any[], separator = ', ') => {
      return Array.isArray(array) ? array.join(separator) : ''
    })

    // JSON helper
    this.handlebars.registerHelper('json', (obj: any, indent = 2) => {
      return JSON.stringify(obj, null, indent)
    })
  }

  /**
   * Load template configuration from directory
   */
  loadTemplateConfig(templateDir: string): TemplateConfig {
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
  renderTemplate(templatePath: string, context: TemplateContext): string {
    if (!existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`)
    }

    try {
      const templateContent = readFileSync(templatePath, 'utf-8')
      const template = this.handlebars.compile(templateContent)
      return template(context)
    } catch (error) {
      throw new Error(`Failed to render template ${templatePath}: ${error}`)
    }
  }

  /**
   * Generate files from template
   */
  generateFromTemplate(
    templateDir: string,
    outputDir: string,
    context: TemplateContext,
    options: {
      includeOptional?: boolean
      dryRun?: boolean
    } = {}
  ): TemplateResult {
    const { includeOptional = true, dryRun = false } = options

    const config = this.loadTemplateConfig(templateDir)
    const files: GeneratedFile[] = []

    // Process each template file
    for (const fileConfig of config.files) {
      if (!includeOptional && fileConfig.optional) {
        continue
      }

      const templatePath = join(templateDir, fileConfig.template)
      const outputPathTemplate = this.handlebars.compile(fileConfig.output)
      const outputPath = outputPathTemplate(context)
      const resolvedOutputPath = join(outputDir, outputPath)

      try {
        const renderedContent = this.renderTemplate(templatePath, context)

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
  listTemplates(templatesDir: string): TemplateConfig[] {
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
              const config = this.loadTemplateConfig(templateDir)
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
  findTemplate(templatesDir: string, name: string): string | null {
    const templates = this.listTemplates(templatesDir)
    const template = templates.find(t => t.name === name)

    if (template) {
      return join(templatesDir, template.category, template.name)
    }

    return null
  }

  /**
   * Validate template directory
   */
  validateTemplate(templateDir: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    try {
      const config = this.loadTemplateConfig(templateDir)

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
  createTemplate(
    templateDir: string,
    config: Partial<TemplateConfig>,
    files: { [filename: string]: string }
  ): void {
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
}
