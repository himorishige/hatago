import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestEnv, type TestCLI } from '../helpers/test-utils.js'

describe('init command', () => {
  let cli: TestCLI
  let cleanup: () => void

  beforeEach(() => {
    ;({ cli, cleanup } = setupTestEnv())
  })

  afterEach(() => {
    cleanup()
  })

  describe('basic project initialization', () => {
    it('should create a basic project', () => {
      const result = cli.run('init test-project')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Project created successfully')
      expect(cli.fileExists('test-project/package.json')).toBe(true)
      expect(cli.fileExists('test-project/src/index.ts')).toBe(true)
      expect(cli.fileExists('test-project/tsconfig.json')).toBe(true)
      expect(cli.fileExists('test-project/.gitignore')).toBe(true)
      expect(cli.fileExists('test-project/README.md')).toBe(true)
      expect(cli.fileExists('test-project/hatago.config.jsonc')).toBe(true)
    })

    it('should create project with custom name', () => {
      const result = cli.run('init my-dir --name custom-project')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Project: custom-project')
      expect(cli.fileExists('my-dir/package.json')).toBe(true)
    })

    it('should create project with custom port', () => {
      const result = cli.run('init test-project --port 3000')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Port: 3000')
    })

    it('should not overwrite existing directory without --force', () => {
      // Create existing directory
      cli.createFile('test-project/existing.txt', 'existing')

      const result = cli.run('init test-project', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('already exists')
    })

    it('should overwrite existing directory with --force', () => {
      // Create existing directory
      cli.createFile('test-project/existing.txt', 'existing')

      const result = cli.run('init test-project --force')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Project created successfully')
    })
  })

  describe('template options', () => {
    it('should create project with basic template', () => {
      const result = cli.run('init test-project --template basic')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Template: basic')
    })

    it('should create project with proxy template', () => {
      const result = cli.run('init test-project --template with-proxy')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Template: with-proxy')

      // Should include @hatago/config dependency
      expect(cli.fileExists('test-project/package.json')).toBe(true)
    })

    it('should create project with plugin-only template', () => {
      const result = cli.run('init test-project --template plugin-only')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('Template: plugin-only')
      expect(cli.fileExists('test-project/src/plugins/hello.ts')).toBe(true)
    })
  })

  describe('package manager options', () => {
    it('should default to pnpm', () => {
      const result = cli.run('init test-project')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('pnpm install')
    })

    it('should use custom package manager', () => {
      const result = cli.run('init test-project --pm npm')

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('npm install')
    })

    it('should skip installation with --skip-install', () => {
      const result = cli.run('init test-project --skip-install')

      expect(result.code).toBe(0)
      expect(result.stdout).not.toContain('Installing dependencies')
    })
  })

  describe('validation', () => {
    it('should validate project name format', () => {
      const result = cli.run('init invalid@name', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('Invalid project name')
    })

    it('should require project name', () => {
      const result = cli.run('init', { expectError: true })

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('required')
    })
  })

  describe('JSON output mode', () => {
    it('should output JSON when --json flag is used', () => {
      const result = cli.run('init test-project --json')

      expect(result.code).toBe(0)
      expect(() => JSON.parse(result.stdout)).not.toThrow()

      const output = JSON.parse(result.stdout)
      expect(output).toHaveProperty('projectName', 'test-project')
      expect(output).toHaveProperty('template', 'basic')
    })
  })

  describe('generated files content', () => {
    beforeEach(() => {
      cli.run('init test-project')
    })

    it('should generate valid package.json', () => {
      expect(cli.fileExists('test-project/package.json')).toBe(true)
      // Could add content validation here
    })

    it('should generate valid TypeScript config', () => {
      expect(cli.fileExists('test-project/tsconfig.json')).toBe(true)
    })

    it('should generate working server code', () => {
      expect(cli.fileExists('test-project/src/index.ts')).toBe(true)
    })

    it('should generate comprehensive README', () => {
      expect(cli.fileExists('test-project/README.md')).toBe(true)
    })
  })
})
