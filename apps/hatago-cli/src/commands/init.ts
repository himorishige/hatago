import { Command } from 'commander'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { green, red, yellow, cyan, blue } from 'colorette'
import { generateConfigTemplate, type HatagoConfig } from '@hatago/config'
import { CLIError } from '../utils/error-handler.js'

/**
 * Project template types
 */
type ProjectTemplate = 'basic' | 'with-proxy' | 'plugin-only'

/**
 * Project initialization options
 */
interface InitOptions {
  template?: ProjectTemplate
  name?: string
  port?: number
  force?: boolean
  skipInstall?: boolean
  packageManager?: 'npm' | 'pnpm' | 'yarn'
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
 * Generate package.json template
 */
function generatePackageJson(projectName: string, template: ProjectTemplate): string {
  const basePackage = {
    name: projectName,
    version: '0.1.0',
    description: 'Hatago MCP server project',
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      dev: 'hatago dev',
      build: 'tsc',
      start: 'node dist/index.js',
      typecheck: 'tsc --noEmit',
    },
    keywords: ['hatago', 'mcp', 'server'],
    author: '',
    license: 'MIT',
    dependencies: {
      '@hono/mcp': 'file:../../docs/dist',
      hono: '^4.6.0',
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      typescript: '^5.0.0',
    },
  }

  if (template === 'with-proxy' || template === 'plugin-only') {
    basePackage.dependencies['@hatago/config'] = 'workspace:*'
  }

  return JSON.stringify(basePackage, null, 2)
}

/**
 * Generate TypeScript config
 */
function generateTsConfig(): string {
  return JSON.stringify(
    {
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2
  )
}

/**
 * Generate basic server template
 */
function generateBasicServer(projectName: string): string {
  return `import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { McpServer } from '@hono/mcp'
import { StreamableHTTPTransport } from '@hono/mcp'

const app = new Hono()
const server = new McpServer({
  name: '${projectName}',
  version: '0.1.0',
  description: 'A simple Hatago MCP server',
})

// Add a simple hello tool
server.registerTool({
  name: 'hello',
  description: 'Say hello with a custom message',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to include in the greeting',
        default: 'world',
      },
    },
  },
}, async ({ message = 'world' }) => {
  return {
    content: [
      {
        type: 'text',
        text: \`Hello, \${message}! This is your Hatago MCP server.\`,
      },
    ],
  }
})

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok', server: '${projectName}' }))

// MCP endpoint
app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

// Start server
const port = Number(process.env.PORT) || 8787
console.log(\`🚀 \${server.name} is running on http://localhost:\${port}\`)
console.log(\`📋 Health check: http://localhost:\${port}/health\`)
console.log(\`🔌 MCP endpoint: http://localhost:\${port}/mcp\`)

serve({
  fetch: app.fetch,
  port,
})
`
}

/**
 * Generate plugin-based server template
 */
function generatePluginServer(projectName: string): string {
  return `import { createHatagoApp } from '@hatago/core'
import { loadConfig } from '@hatago/config'
import { helloPlugin } from './plugins/hello.js'

async function main() {
  // Load configuration
  const { config } = await loadConfig()
  
  // Create Hatago app with plugins
  const { app, server } = createHatagoApp({
    name: '${projectName}',
    version: '0.1.0',
    description: 'A plugin-based Hatago MCP server',
    config,
    plugins: [
      helloPlugin,
    ],
  })

  // Start server
  const port = config.server?.port || 8787
  console.log(\`🚀 \${server.name} is running on http://localhost:\${port}\`)
  console.log(\`📋 Health check: http://localhost:\${port}/health\`)
  console.log(\`🔌 MCP endpoint: http://localhost:\${port}/mcp\`)

  const { serve } = await import('@hono/node-server')
  serve({
    fetch: app.fetch,
    port,
  })
}

main().catch(console.error)
`
}

/**
 * Generate hello plugin template
 */
function generateHelloPlugin(): string {
  return `import type { HatagoPlugin } from '@hatago/core'

export const helloPlugin: HatagoPlugin = ({ server }) => {
  server.registerTool({
    name: 'hello',
    description: 'Say hello with a custom message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to include in the greeting',
          default: 'world',
        },
      },
    },
  }, async ({ message = 'world' }) => {
    return {
      content: [
        {
          type: 'text',
          text: \`Hello, \${message}! This is from a Hatago plugin.\`,
        },
      ],
    }
  })
}
`
}

/**
 * Generate .gitignore
 */
function generateGitignore(): string {
  return `# Dependencies
node_modules/
.pnpm-lock.yaml
yarn.lock
package-lock.json

# Build output
dist/
build/

# Environment variables
.env
.env.local
.env.development
.env.production

# Logs
*.log
logs/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo
`
}

/**
 * Generate README.md
 */
function generateReadme(projectName: string, template: ProjectTemplate): string {
  return `# ${projectName}

A Hatago MCP server project${template === 'with-proxy' ? ' with external MCP proxy support' : template === 'plugin-only' ? ' using plugin architecture' : ''}.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   pnpm dev
   \`\`\`

3. Test the server:
   \`\`\`bash
   curl http://localhost:8787/health
   \`\`\`

## Available Commands

- \`pnpm dev\` - Start development server with hot reload
- \`pnpm build\` - Build the project
- \`pnpm start\` - Start production server
- \`pnpm typecheck\` - Run TypeScript type checking

## Project Structure

\`\`\`
${projectName}/
├── src/
│   ├── index.ts          # Main server entry point
${template === 'plugin-only' ? '│   └── plugins/\n│       └── hello.ts      # Example plugin' : ''}
├── hatago.config.jsonc   # Hatago configuration${template === 'with-proxy' ? ' (with proxy setup)' : ''}
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## Configuration

${template === 'basic' ? 'This project uses a basic Hatago setup. Configuration is handled through environment variables and the main server file.' : 'Configuration is managed through \`hatago.config.jsonc\`. See the [Hatago documentation](https://hatago.dev/docs) for available options.'}

## Adding Tools

${template === 'basic' ? 'Add new MCP tools by registering them with the server instance in \`src/index.ts\`.' : 'Create new plugins in the \`src/plugins/\` directory and register them in \`src/index.ts\`.'}

## Deployment

1. Build the project:
   \`\`\`bash
   pnpm build
   \`\`\`

2. Start the production server:
   \`\`\`bash
   pnpm start
   \`\`\`

For more information, visit the [Hatago documentation](https://hatago.dev).
`
}

/**
 * Generate configuration template based on project type
 */
function generateProjectConfig(template: ProjectTemplate, port: number): string {
  if (template === 'basic') {
    return generateConfigTemplate()
  }

  const config: Partial<HatagoConfig> = {
    $schema: 'https://hatago.dev/schema/config.json',
    server: {
      port,
      hostname: 'localhost',
      cors: true,
      timeout: 30000,
    },
    logging: {
      level: 'info',
      format: 'pretty',
      output: 'console',
    },
    security: {
      requireAuth: false,
      allowedOrigins: ['*'],
    },
  }

  if (template === 'with-proxy') {
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

  return JSON.stringify(config, null, 2)
}

/**
 * Handle init command
 */
async function handleInit(projectPath: string, options: InitOptions): Promise<void> {
  const {
    template = 'basic',
    name,
    port = 8787,
    force = false,
    skipInstall = false,
    packageManager = 'pnpm',
  } = options

  const fullPath = resolve(projectPath)
  const projectName = name || projectPath

  // Check if directory exists
  if (existsSync(fullPath) && !force) {
    throw new CLIError(`Directory already exists: ${fullPath}\\nUse --force to overwrite`, 1)
  }

  if (process.env.HATAGO_JSON_OUTPUT === 'true') {
    outputResult({
      projectPath: fullPath,
      projectName,
      template,
      created: true,
    })
    return
  }

  console.log(`\\n🚀 ${cyan('Creating new Hatago project...')}`)
  console.log(`📁 Project: ${blue(projectName)}`)
  console.log(`📂 Location: ${fullPath}`)
  console.log(`🎨 Template: ${template}`)
  console.log(`🌐 Port: ${port}`)

  // Create project directory
  mkdirSync(fullPath, { recursive: true })

  // Create src directory
  const srcDir = join(fullPath, 'src')
  mkdirSync(srcDir, { recursive: true })

  // Generate files based on template
  const files: Record<string, string> = {
    'package.json': generatePackageJson(projectName, template),
    'tsconfig.json': generateTsConfig(),
    '.gitignore': generateGitignore(),
    'README.md': generateReadme(projectName, template),
    'hatago.config.jsonc': generateProjectConfig(template, port),
  }

  // Add main server file
  if (template === 'basic') {
    files['src/index.ts'] = generateBasicServer(projectName)
  } else {
    files['src/index.ts'] = generatePluginServer(projectName)

    if (template === 'plugin-only') {
      const pluginsDir = join(srcDir, 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      files['src/plugins/hello.ts'] = generateHelloPlugin()
    }
  }

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullFilePath = join(fullPath, filePath)
    writeFileSync(fullFilePath, content)
    console.log(`   ${green('✓')} ${filePath}`)
  }

  console.log(`\\n${green('✅')} Project created successfully!`)

  if (!skipInstall) {
    console.log(`\\n📦 Installing dependencies with ${packageManager}...`)
    console.log(`💡 Run \`cd ${projectName} && ${packageManager} install\` to install dependencies`)
  }

  console.log(`\\n🎯 Next steps:`)
  console.log(`   1. cd ${projectName}`)
  if (!skipInstall) {
    console.log(`   2. ${packageManager} install`)
  }
  console.log(`   ${skipInstall ? '2' : '3'}. ${packageManager} dev`)
  console.log(`\\n📚 Learn more: https://hatago.dev/docs`)
}

/**
 * Create init command
 */
export const initCommand = new Command('init')
  .description('Initialize a new Hatago project')
  .argument('<project-name>', 'Name of the project directory')
  .option('-t, --template <type>', 'Project template (basic|with-proxy|plugin-only)', 'basic')
  .option('-n, --name <name>', 'Project name (defaults to directory name)')
  .option('-p, --port <port>', 'Server port', '8787')
  .option('-f, --force', 'Overwrite existing directory')
  .option('--skip-install', 'Skip dependency installation')
  .option('--pm <manager>', 'Package manager (npm|pnpm|yarn)', 'pnpm')
  .action(handleInit)

// Add help examples
initCommand.on('--help', () => {
  console.log(`
Examples:
  hatago init my-server                     Create basic server
  hatago init my-server --template with-proxy  Create server with proxy support
  hatago init my-server --template plugin-only Create plugin-based server
  hatago init my-server --port 3000         Create server on custom port
  hatago init my-server --force             Overwrite existing directory
`)
})
