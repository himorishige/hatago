import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TemplateConfig, TemplateEngine } from '../src/template.js'

describe('TemplateEngine', () => {
  let engine: TemplateEngine
  let tempDir: string

  beforeEach(() => {
    engine = new TemplateEngine()
    tempDir = mkdtempSync(join(tmpdir(), 'hatago-template-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Handlebars helpers', () => {
    it('should transform strings with camelCase helper', () => {
      const template = '{{camelCase name}}'
      const result = engine.renderTemplate(createTempTemplate(template), { name: 'hello world' })
      expect(result).toBe('helloWorld')
    })

    it('should transform strings with kebabCase helper', () => {
      const template = '{{kebabCase name}}'
      const result = engine.renderTemplate(createTempTemplate(template), { name: 'Hello World' })
      expect(result).toBe('hello-world')
    })

    it('should transform strings with snakeCase helper', () => {
      const template = '{{snakeCase name}}'
      const result = engine.renderTemplate(createTempTemplate(template), { name: 'Hello World' })
      expect(result).toBe('hello_world')
    })

    it('should transform strings with titleCase helper', () => {
      const template = '{{titleCase name}}'
      const result = engine.renderTemplate(createTempTemplate(template), { name: 'hello world' })
      expect(result).toBe('Hello World')
    })

    it('should generate timestamps', () => {
      const template = '{{timestamp}}'
      const result = engine.renderTemplate(createTempTemplate(template), {})
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })

    it('should handle conditional helpers', () => {
      const template = '{{#if (eq status "active")}}Active{{else}}Inactive{{/if}}'

      const activeResult = engine.renderTemplate(createTempTemplate(template), { status: 'active' })
      expect(activeResult).toBe('Active')

      const inactiveResult = engine.renderTemplate(createTempTemplate(template), {
        status: 'inactive',
      })
      expect(inactiveResult).toBe('Inactive')
    })

    it('should handle array helpers', () => {
      const template = 'Length: {{length items}}, Joined: {{join items ", "}}'
      const result = engine.renderTemplate(createTempTemplate(template), { items: ['a', 'b', 'c'] })
      expect(result).toBe('Length: 3, Joined: a, b, c')
    })

    it('should handle JSON helper', () => {
      const template = '{{json data}}'
      const result = engine.renderTemplate(createTempTemplate(template), {
        data: { name: 'test', value: 42 },
      })
      expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}')
    })
  })

  describe('Template configuration loading', () => {
    it('should load valid template configuration', () => {
      const config: TemplateConfig = {
        name: 'test-template',
        displayName: 'Test Template',
        description: 'A test template',
        category: 'test',
        tags: ['test'],
        author: 'Test Author',
        version: '1.0.0',
        files: [
          {
            template: 'test.hbs',
            output: '{{name}}.ts',
            description: 'Test file',
          },
        ],
        prompts: [],
      }

      const templateDir = join(tempDir, 'test-template')
      createTemplateDirectory(templateDir, config, {
        'test.hbs': 'export const {{name}} = "{{description}}"',
      })

      const loadedConfig = engine.loadTemplateConfig(templateDir)
      expect(loadedConfig).toEqual(config)
    })

    it('should throw error for missing config file', () => {
      expect(() => {
        engine.loadTemplateConfig(join(tempDir, 'nonexistent'))
      }).toThrow('Template configuration not found')
    })

    it('should throw error for invalid JSON', () => {
      const invalidDir = join(tempDir, 'invalid')
      writeFileSync(join(invalidDir, 'template.config.json'), 'invalid json', { flag: 'w' })

      expect(() => {
        engine.loadTemplateConfig(invalidDir)
      }).toThrow('Failed to parse template configuration')
    })
  })

  describe('Template rendering', () => {
    it('should render simple template', () => {
      const templatePath = createTempTemplate('Hello {{name}}!')
      const result = engine.renderTemplate(templatePath, { name: 'World' })
      expect(result).toBe('Hello World!')
    })

    it('should render complex template with loops', () => {
      const template = `
{{#each items}}
- {{name}}: {{description}}
{{/each}}
`.trim()

      const templatePath = createTempTemplate(template)
      const result = engine.renderTemplate(templatePath, {
        items: [
          { name: 'Item 1', description: 'First item' },
          { name: 'Item 2', description: 'Second item' },
        ],
      })

      expect(result).toContain('- Item 1: First item')
      expect(result).toContain('- Item 2: Second item')
    })

    it('should throw error for missing template file', () => {
      expect(() => {
        engine.renderTemplate(join(tempDir, 'nonexistent.hbs'), {})
      }).toThrow('Template file not found')
    })
  })

  describe('File generation', () => {
    let templateDir: string
    let outputDir: string

    beforeEach(() => {
      templateDir = join(tempDir, 'template')
      outputDir = join(tempDir, 'output')

      const config: TemplateConfig = {
        name: 'test',
        displayName: 'Test Template',
        description: 'Test template',
        category: 'test',
        tags: [],
        author: 'Test',
        version: '1.0.0',
        files: [
          {
            template: 'main.hbs',
            output: '{{kebabCase name}}.ts',
            description: 'Main file',
          },
          {
            template: 'readme.hbs',
            output: 'README.md',
            description: 'Documentation',
            optional: true,
          },
        ],
        prompts: [],
      }

      createTemplateDirectory(templateDir, config, {
        'main.hbs': 'export const {{camelCase name}} = "{{description}}"',
        'readme.hbs': '# {{titleCase name}}\n\n{{description}}',
      })
    })

    it('should generate files from template', () => {
      const result = engine.generateFromTemplate(templateDir, outputDir, {
        name: 'TestPlugin',
        description: 'A test plugin',
      })

      expect(result.files).toHaveLength(2)
      expect(result.files[0].path).toContain('test-plugin.ts')
      expect(result.files[1].path).toContain('README.md')

      expect(existsSync(result.files[0].path)).toBe(true)
      expect(existsSync(result.files[1].path)).toBe(true)

      const mainContent = readFileSync(result.files[0].path, 'utf-8')
      expect(mainContent).toBe('export const testPlugin = "A test plugin"')

      const readmeContent = readFileSync(result.files[1].path, 'utf-8')
      expect(readmeContent).toBe('# Testplugin\n\nA test plugin')
    })

    it('should handle dry run mode', () => {
      const result = engine.generateFromTemplate(
        templateDir,
        outputDir,
        { name: 'TestPlugin', description: 'A test plugin' },
        { dryRun: true }
      )

      expect(result.files).toHaveLength(2)
      expect(existsSync(result.files[0].path)).toBe(false)
      expect(existsSync(result.files[1].path)).toBe(false)
    })

    it('should skip optional files when requested', () => {
      const result = engine.generateFromTemplate(
        templateDir,
        outputDir,
        { name: 'TestPlugin', description: 'A test plugin' },
        { includeOptional: false }
      )

      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toContain('test-plugin.ts')
    })
  })

  describe('Template discovery', () => {
    beforeEach(() => {
      // Create template structure
      const templatesDir = join(tempDir, 'templates')

      // Plugin templates
      createTemplateDirectory(
        join(templatesDir, 'plugins', 'basic'),
        {
          name: 'basic',
          displayName: 'Basic Plugin',
          description: 'Basic plugin template',
          category: 'plugins',
          tags: ['basic'],
          author: 'Test',
          version: '1.0.0',
          files: [{ template: 'plugin.hbs', output: '{{name}}.ts', description: 'Plugin file' }],
          prompts: [],
        },
        { 'plugin.hbs': 'export const {{name}}Plugin = {}' }
      )

      // Project templates
      createTemplateDirectory(
        join(templatesDir, 'projects', 'minimal'),
        {
          name: 'minimal',
          displayName: 'Minimal Project',
          description: 'Minimal project template',
          category: 'projects',
          tags: ['minimal'],
          author: 'Test',
          version: '1.0.0',
          files: [{ template: 'index.hbs', output: 'index.ts', description: 'Entry point' }],
          prompts: [],
        },
        { 'index.hbs': 'console.log("{{name}}")' }
      )
    })

    it('should list available templates', () => {
      const templatesDir = join(tempDir, 'templates')
      const templates = engine.listTemplates(templatesDir)

      expect(templates).toHaveLength(2)
      expect(templates.find(t => t.name === 'basic')).toBeDefined()
      expect(templates.find(t => t.name === 'minimal')).toBeDefined()
    })

    it('should find template by name', () => {
      const templatesDir = join(tempDir, 'templates')
      const templatePath = engine.findTemplate(templatesDir, 'basic')

      expect(templatePath).toBe(join(templatesDir, 'plugins', 'basic'))
    })

    it('should return null for non-existent template', () => {
      const templatesDir = join(tempDir, 'templates')
      const templatePath = engine.findTemplate(templatesDir, 'nonexistent')

      expect(templatePath).toBeNull()
    })
  })

  describe('Template validation', () => {
    it('should validate correct template', () => {
      const config: TemplateConfig = {
        name: 'valid',
        displayName: 'Valid Template',
        description: 'A valid template',
        category: 'test',
        tags: [],
        author: 'Test',
        version: '1.0.0',
        files: [{ template: 'test.hbs', output: 'test.ts', description: 'Test file' }],
        prompts: [],
      }

      const templateDir = join(tempDir, 'valid')
      createTemplateDirectory(templateDir, config, { 'test.hbs': 'test content' })

      const validation = engine.validateTemplate(templateDir)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toEqual([])
    })

    it('should detect missing required fields', () => {
      const config = {
        displayName: 'Invalid Template',
        // Missing required fields
      } as any

      const templateDir = join(tempDir, 'invalid')
      createTemplateDirectory(templateDir, config, {})

      const validation = engine.validateTemplate(templateDir)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('Template name is required')
    })

    it('should detect missing template files', () => {
      const config: TemplateConfig = {
        name: 'missing-files',
        displayName: 'Missing Files Template',
        description: 'Template with missing files',
        category: 'test',
        tags: [],
        author: 'Test',
        version: '1.0.0',
        files: [{ template: 'missing.hbs', output: 'missing.ts', description: 'Missing file' }],
        prompts: [],
      }

      const templateDir = join(tempDir, 'missing')
      createTemplateDirectory(templateDir, config, {}) // No template files

      const validation = engine.validateTemplate(templateDir)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('Template file not found: missing.hbs')
    })
  })

  // Helper functions
  function createTempTemplate(content: string): string {
    const templatePath = join(tempDir, 'temp-template.hbs')
    writeFileSync(templatePath, content)
    return templatePath
  }

  function createTemplateDirectory(
    dir: string,
    config: TemplateConfig,
    files: Record<string, string>
  ): void {
    // Create directory structure
    const parts = dir.split('/')
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? join(currentPath, part) : part
      if (!existsSync(currentPath)) {
        require('node:fs').mkdirSync(currentPath)
      }
    }

    // Write config file
    writeFileSync(join(dir, 'template.config.json'), JSON.stringify(config, null, 2))

    // Write template files
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(dir, filename), content)
    }
  }
})
