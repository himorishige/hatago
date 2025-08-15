# Publishing Hatago Plugins Guide

## Overview

This guide walks you through the complete process of creating, publishing, and maintaining Hatago plugins using GitHub as the distribution platform. Whether you're building a simple tool plugin or a complex integration, this guide covers all the essential steps.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Plugin Development](#plugin-development)
- [Repository Setup](#repository-setup)
- [Plugin Metadata](#plugin-metadata)
- [Documentation](#documentation)
- [Testing](#testing)
- [Publishing Process](#publishing-process)
- [Automation with GitHub Actions](#automation-with-github-actions)
- [Maintenance and Updates](#maintenance-and-updates)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Prerequisites

### Required Tools

- **Node.js 18+** - Runtime environment
- **Git** - Version control
- **GitHub Account** - Repository hosting
- **Hatago CLI** - Development and testing tools
- **Code Editor** - VS Code recommended with TypeScript support

### Knowledge Requirements

- Basic TypeScript/JavaScript
- Understanding of MCP (Model Context Protocol)
- Familiarity with Git and GitHub
- Basic knowledge of npm/pnpm package management

### Setup Verification

```bash
# Check versions
node --version     # Should be 18+
git --version      # Any recent version
hatago --version   # Should be 0.1.0+

# Verify Hatago CLI installation
hatago --help
```

## Plugin Development

### 1. Initialize Plugin Project

```bash
# Create new plugin using Hatago CLI
hatago create-plugin my-awesome-plugin --interactive

# Or manually create directory
mkdir hatago-my-plugin
cd hatago-my-plugin
npm init -y
```

### 2. Project Structure

Follow this recommended directory structure:

```
hatago-my-plugin/
├── src/
│   ├── index.ts           # Main plugin export
│   ├── types.ts           # Type definitions
│   └── utils/
│       └── helpers.ts     # Utility functions
├── tests/
│   ├── plugin.test.ts     # Unit tests
│   └── fixtures/          # Test data
├── examples/
│   ├── basic-usage.ts     # Simple usage example
│   └── advanced-setup.ts  # Complex configuration
├── docs/
│   ├── README.md          # Main documentation
│   ├── api.md             # API reference
│   └── configuration.md   # Configuration guide
├── .github/
│   └── workflows/
│       ├── test.yml       # CI testing
│       └── release.yml    # Automated releases
├── hatago.plugin.json     # Plugin metadata (required)
├── package.json           # NPM configuration
├── tsconfig.json          # TypeScript config
├── .gitignore             # Git ignore rules
├── LICENSE                # License file
└── CHANGELOG.md           # Version history
```

### 3. Core Plugin Implementation

Create your main plugin file (`src/index.ts`):

```typescript
import type { HatagoPlugin } from '@hatago/types'

export const myAwesomePlugin: HatagoPlugin = ({ server, app, env, getBaseUrl }) => {
  // Register MCP tools
  server.registerTool(
    {
      name: 'my-tool',
      description: 'Description of what this tool does',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input parameter description',
          },
        },
        required: ['input'],
      },
    },
    async ({ input }) => {
      try {
        // Your tool implementation
        const result = await processInput(input)

        return {
          content: [
            {
              type: 'text',
              text: `Processed: ${result}`,
            },
          ],
        }
      } catch (error) {
        throw new Error(`Tool execution failed: ${error.message}`)
      }
    }
  )

  // Register HTTP routes (optional)
  app.get('/my-plugin/status', c => {
    return c.json({
      status: 'ok',
      version: '1.0.0',
      features: ['tool1', 'tool2'],
    })
  })

  // Register resources (optional)
  server.registerResource(
    {
      uri: 'my-plugin://config',
      name: 'Plugin Configuration',
      description: 'Current plugin configuration',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                enabled: true,
                version: '1.0.0',
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}

// Helper function
async function processInput(input: string): Promise<string> {
  // Implementation details
  return input.toUpperCase()
}

// Export plugin as default
export default myAwesomePlugin
```

### 4. Type Definitions

Create type definitions (`src/types.ts`):

```typescript
export interface PluginConfig {
  apiKey?: string
  endpoint?: string
  timeout?: number
}

export interface ToolResult {
  success: boolean
  data: unknown
  error?: string
}

export interface PluginContext {
  config: PluginConfig
  version: string
}
```

## Repository Setup

### 1. Create GitHub Repository

1. **Repository Creation**
   - Go to [GitHub](https://github.com/new)
   - Repository name: `hatago-my-plugin` (recommended naming)
   - Description: Brief plugin description
   - Public repository (for community plugins)
   - Initialize with README

2. **Local Setup**
   ```bash
   git clone https://github.com/username/hatago-my-plugin.git
   cd hatago-my-plugin
   git remote -v  # Verify remote
   ```

### 2. Configure Repository Settings

#### Topics Configuration

Add these required topics:

- `hatago-plugin` (required)
- `mcp` (required)
- `typescript` (if using TypeScript)
- Additional descriptive topics

#### Repository Settings

- **Visibility**: Public for community plugins
- **Features**: Enable Issues, Wiki (optional)
- **Security**: Enable vulnerability alerts
- **Branches**: Protect main branch

### 3. Branch Strategy

```bash
# Main branch for stable releases
git checkout main

# Development branch
git checkout -b develop
git push -u origin develop

# Feature branches
git checkout -b feature/new-tool
git checkout -b bugfix/error-handling
```

## Plugin Metadata

### Create `hatago.plugin.json`

This file is required and contains essential plugin metadata:

```json
{
  "$schema": "https://hatago.dev/schemas/plugin.json",
  "name": "my-awesome-plugin",
  "displayName": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "A plugin that does awesome things with MCP tools",
  "author": "John Doe <john@example.com>",
  "license": "MIT",
  "homepage": "https://github.com/johndoe/hatago-my-plugin",
  "repository": {
    "type": "git",
    "url": "https://github.com/johndoe/hatago-my-plugin.git"
  },
  "keywords": ["productivity", "automation", "api"],
  "categories": ["tools", "utilities"],
  "hatago": {
    "compatibility": ">=0.1.0",
    "type": "plugin",
    "main": "src/index.ts",
    "exports": {
      "tools": [
        {
          "name": "process-text",
          "description": "Process and transform text input"
        },
        {
          "name": "validate-data",
          "description": "Validate data against schema"
        }
      ],
      "resources": [
        {
          "uri": "my-plugin://config",
          "description": "Plugin configuration resource"
        }
      ],
      "routes": [
        {
          "path": "/my-plugin/status",
          "method": "GET",
          "description": "Plugin status endpoint"
        }
      ]
    },
    "dependencies": {
      "env": ["MY_PLUGIN_API_KEY"]
    },
    "configuration": {
      "apiKey": {
        "type": "string",
        "required": true,
        "description": "API key for external service"
      },
      "timeout": {
        "type": "number",
        "default": 5000,
        "description": "Request timeout in milliseconds"
      }
    }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@hatago/types": "^0.1.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0"
  }
}
```

### Metadata Validation

```bash
# Validate metadata using Hatago CLI
hatago validate-plugin ./hatago.plugin.json

# Or use JSON schema validation
npm install -g ajv-cli
ajv validate -s https://hatago.dev/schemas/plugin.json -d hatago.plugin.json
```

## Documentation

### 1. README.md Structure

Create comprehensive documentation:

```markdown
# My Awesome Plugin

Brief description of what your plugin does.

## Features

- ✅ Feature 1
- ✅ Feature 2
- ✅ Feature 3

## Installation

\`\`\`bash
hatago install github:username/hatago-my-plugin
\`\`\`

## Configuration

\`\`\`json
{
"apiKey": "your-api-key-here",
"timeout": 5000
}
\`\`\`

## Usage

### Basic Usage

\`\`\`typescript
// Example usage
\`\`\`

### Advanced Configuration

\`\`\`typescript
// Advanced example
\`\`\`

## API Reference

### Tools

#### process-text

Process and transform text input.

**Parameters:**

- \`input\` (string, required): Text to process
- \`options\` (object, optional): Processing options

**Returns:**
Text processing result

### Resources

#### my-plugin://config

Plugin configuration resource.

### HTTP Routes

#### GET /my-plugin/status

Returns plugin status information.

## Environment Variables

- \`MY_PLUGIN_API_KEY\`: Required API key
- \`MY_PLUGIN_TIMEOUT\`: Optional timeout setting

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## License

MIT License - see [LICENSE](LICENSE) file.
```

### 2. API Documentation

Create detailed API documentation (`docs/api.md`):

```markdown
# API Reference

## Tools

### process-text

Process and transform text input with various options.

**Input Schema:**
\`\`\`json
{
"type": "object",
"properties": {
"input": {
"type": "string",
"description": "Text to process"
},
"options": {
"type": "object",
"properties": {
"uppercase": {"type": "boolean"},
"trim": {"type": "boolean"}
}
}
},
"required": ["input"]
}
\`\`\`

**Output:**
Returns processed text result.

**Examples:**
\`\`\`bash

# Basic usage

hatago call process-text '{"input": "hello world"}'

# With options

hatago call process-text '{"input": " Hello World ", "options": {"uppercase": true, "trim": true}}'
\`\`\`
```

### 3. Configuration Guide

Create configuration documentation (`docs/configuration.md`):

```markdown
# Configuration Guide

## Environment Variables

### Required Variables

- \`MY_PLUGIN_API_KEY\`: API key for external service
  - How to obtain: Visit https://example.com/api-keys
  - Format: String, 32 characters

### Optional Variables

- \`MY_PLUGIN_TIMEOUT\`: Request timeout in milliseconds
  - Default: 5000
  - Range: 1000-30000

## Configuration File

Create \`my-plugin.config.json\` in your project root:

\`\`\`json
{
"apiKey": "${MY_PLUGIN_API_KEY}",
"timeout": 5000,
"retries": 3,
"endpoint": "https://api.example.com"
}
\`\`\`

## Validation

The plugin validates configuration on startup and will throw errors for:

- Missing required fields
- Invalid data types
- Out-of-range values
```

## Testing

### 1. Unit Tests

Create comprehensive test suite (`tests/plugin.test.ts`):

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { McpServer } from '@hono/mcp'
import { Hono } from 'hono'
import myAwesomePlugin from '../src/index'

describe('My Awesome Plugin', () => {
  let app: Hono
  let server: McpServer
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    app = new Hono()
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    })
    mockEnv = {
      MY_PLUGIN_API_KEY: 'test-key',
    }
  })

  it('should register plugin successfully', () => {
    expect(() => {
      myAwesomePlugin({
        app,
        server,
        env: mockEnv,
        getBaseUrl: () => new URL('http://localhost:8787'),
      })
    }).not.toThrow()
  })

  it('should register expected tools', () => {
    myAwesomePlugin({
      app,
      server,
      env: mockEnv,
      getBaseUrl: () => new URL('http://localhost:8787'),
    })

    const tools = server.getAvailableTools()
    expect(tools).toContainEqual(
      expect.objectContaining({
        name: 'process-text',
      })
    )
  })

  it('should process text correctly', async () => {
    myAwesomePlugin({
      app,
      server,
      env: mockEnv,
      getBaseUrl: () => new URL('http://localhost:8787'),
    })

    const result = await server.callTool('process-text', {
      input: 'hello world',
    })

    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Processed: HELLO WORLD',
    })
  })

  it('should handle errors gracefully', async () => {
    myAwesomePlugin({
      app,
      server,
      env: mockEnv,
      getBaseUrl: () => new URL('http://localhost:8787'),
    })

    await expect(
      server.callTool('process-text', {
        input: null,
      })
    ).rejects.toThrow('Tool execution failed')
  })
})
```

### 2. Integration Tests

Create integration tests (`tests/integration.test.ts`):

```typescript
import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import { promisify } from 'util'

describe('Plugin Integration', () => {
  it('should work with Hatago server', async () => {
    // Start Hatago server with plugin
    const server = spawn('hatago', ['dev'], {
      env: {
        ...process.env,
        MY_PLUGIN_API_KEY: 'test-key',
      },
    })

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000))

    try {
      // Test MCP call
      const response = await fetch('http://localhost:8787/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })

      const result = await response.json()
      expect(result.result.tools).toContainEqual(
        expect.objectContaining({
          name: 'process-text',
        })
      )
    } finally {
      server.kill()
    }
  })
})
```

### 3. Test Configuration

Configure test runner (`vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', 'dist/'],
    },
  },
})
```

## Publishing Process

### 1. Version Management

Follow semantic versioning:

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.1 -> 1.1.0)
npm version minor

# Major release (1.1.0 -> 2.0.0)
npm version major
```

### 2. Create Release

```bash
# Ensure all changes are committed
git add .
git commit -m "Prepare release v1.0.0"

# Create and push tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin main
git push origin v1.0.0
```

### 3. GitHub Release

1. **Go to Repository Releases**
   - Navigate to `https://github.com/username/repo/releases`
   - Click "Create a new release"

2. **Release Configuration**
   - Tag: Select existing tag (v1.0.0)
   - Title: "Release v1.0.0"
   - Description: Release notes and changelog

3. **Release Notes Template**

   ```markdown
   ## What's New in v1.0.0

   ### Features

   - ✨ Added new text processing tool
   - ✨ HTTP status endpoint
   - ✨ Configuration validation

   ### Bug Fixes

   - 🐛 Fixed error handling in tool execution
   - 🐛 Improved input validation

   ### Documentation

   - 📚 Complete API documentation
   - 📚 Configuration examples
   - 📚 Usage guides

   ## Installation

   \`\`\`bash
   hatago install github:username/hatago-my-plugin@v1.0.0
   \`\`\`

   ## Breaking Changes

   None in this release.

   ## Contributors

   Thanks to all contributors who helped with this release!
   ```

### 4. Verification

Test installation after release:

```bash
# Test installation from GitHub
hatago install github:username/hatago-my-plugin

# Verify plugin functionality
hatago list
hatago info my-awesome-plugin
```

## Automation with GitHub Actions

### 1. Continuous Integration

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '20'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  validate-plugin:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Hatago CLI
        run: npm install -g hatago-cli

      - name: Validate plugin metadata
        run: hatago validate-plugin hatago.plugin.json

      - name: Test plugin installation
        run: |
          mkdir test-project
          cd test-project
          hatago init test --skip-install
          hatago install github:${{ github.repository }}@${{ github.sha }}
```

### 2. Automated Releases

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  NODE_VERSION: '20'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build plugin
        run: npm run build

      - name: Create Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: |
            ## Changes

            Please see [CHANGELOG.md](CHANGELOG.md) for details.

            ## Installation

            \`\`\`bash
            hatago install github:${{ github.repository }}@${{ github.ref_name }}
            \`\`\`
          draft: false
          prerelease: false

      - name: Notify community
        run: |
          echo "Plugin released: ${{ github.ref_name }}"
          # Add community notification logic here
```

### 3. Security Scanning

Create `.github/workflows/security.yml`:

```yaml
name: Security

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level moderate

      - name: Run CodeQL Analysis
        uses: github/codeql-action/init@v2
        with:
          languages: typescript

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

      - name: Run Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

## Maintenance and Updates

### 1. Version Updates

Keep dependencies current:

```bash
# Check outdated packages
npm outdated

# Update dependencies
npm update

# Update major versions (check breaking changes)
npm install package@latest
```

### 2. Security Updates

Monitor security advisories:

```bash
# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Review and fix remaining issues
npm audit fix --force  # Use with caution
```

### 3. Community Engagement

- Respond to issues promptly
- Review and merge pull requests
- Update documentation regularly
- Engage with user feedback

### 4. Monitoring

Track plugin usage and health:

- GitHub repository insights
- Download statistics from releases
- Issue and discussion activity
- Community feedback

## Best Practices

### Code Quality

1. **TypeScript Usage**
   - Use strict TypeScript configuration
   - Define proper types for all interfaces
   - Enable all strict checks

2. **Error Handling**
   - Catch and handle all errors gracefully
   - Provide meaningful error messages
   - Log errors appropriately

3. **Performance**
   - Minimize external dependencies
   - Implement caching where appropriate
   - Handle large datasets efficiently

### Security

1. **Input Validation**
   - Validate all external inputs
   - Use schema validation (Zod recommended)
   - Sanitize user-provided data

2. **Environment Variables**
   - Never commit secrets to repository
   - Use environment variables for sensitive data
   - Provide clear documentation for required variables

3. **Dependencies**
   - Regularly update dependencies
   - Use npm audit for security scanning
   - Pin dependency versions for stability

### Documentation

1. **Comprehensive README**
   - Clear installation instructions
   - Usage examples
   - Configuration documentation
   - API reference

2. **Code Comments**
   - Document complex logic
   - Explain configuration options
   - Provide usage examples

3. **Change Management**
   - Maintain detailed changelog
   - Document breaking changes
   - Provide migration guides

### Community

1. **Responsive Maintenance**
   - Address issues promptly
   - Review pull requests quickly
   - Communicate clearly with users

2. **Backward Compatibility**
   - Minimize breaking changes
   - Provide deprecation warnings
   - Maintain migration paths

3. **Quality Standards**
   - Comprehensive test coverage
   - Consistent code style
   - Regular dependency updates

## Examples

### Simple Tool Plugin

Complete example of a basic text processing plugin:

```typescript
// src/index.ts
import type { HatagoPlugin } from '@hatago/types'
import { z } from 'zod'

const configSchema = z.object({
  prefix: z.string().default('Processed: '),
  uppercase: z.boolean().default(false),
})

export const textProcessorPlugin: HatagoPlugin = ({ server, env }) => {
  const config = configSchema.parse({
    prefix: env?.TEXT_PREFIX,
    uppercase: env?.TEXT_UPPERCASE === 'true',
  })

  server.registerTool(
    {
      name: 'process-text',
      description: 'Process text with optional transformations',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to process',
          },
          options: {
            type: 'object',
            properties: {
              uppercase: { type: 'boolean' },
              trim: { type: 'boolean' },
            },
          },
        },
        required: ['text'],
      },
    },
    async ({ text, options = {} }) => {
      try {
        let result = text

        if (options.trim) {
          result = result.trim()
        }

        if (options.uppercase || config.uppercase) {
          result = result.toUpperCase()
        }

        result = config.prefix + result

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        }
      } catch (error) {
        throw new Error(`Text processing failed: ${error.message}`)
      }
    }
  )
}

export default textProcessorPlugin
```

### API Integration Plugin

Example of a plugin that integrates with external APIs:

```typescript
// src/index.ts
import type { HatagoPlugin } from '@hatago/types'

interface WeatherData {
  temperature: number
  description: string
  humidity: number
}

export const weatherPlugin: HatagoPlugin = ({ server, env }) => {
  const apiKey = env?.WEATHER_API_KEY
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY environment variable is required')
  }

  server.registerTool(
    {
      name: 'get-weather',
      description: 'Get current weather for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Location (city, country)',
          },
        },
        required: ['location'],
      },
    },
    async ({ location }) => {
      try {
        const response = await fetch(
          `https://api.weather.com/v1/current?location=${encodeURIComponent(location)}&key=${apiKey}`
        )

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.statusText}`)
        }

        const data: WeatherData = await response.json()

        return {
          content: [
            {
              type: 'text',
              text: `Weather in ${location}:
Temperature: ${data.temperature}°C
Description: ${data.description}
Humidity: ${data.humidity}%`,
            },
          ],
        }
      } catch (error) {
        throw new Error(`Failed to fetch weather: ${error.message}`)
      }
    }
  )

  server.registerResource(
    {
      uri: 'weather://locations',
      name: 'Available Locations',
      description: 'List of supported weather locations',
      mimeType: 'application/json',
    },
    async () => {
      const locations = ['New York, US', 'London, UK', 'Tokyo, JP', 'Sydney, AU']

      return {
        contents: [
          {
            type: 'text',
            text: JSON.stringify({ locations }, null, 2),
          },
        ],
      }
    }
  )
}

export default weatherPlugin
```

## Troubleshooting

### Common Issues

1. **Plugin not loading**
   - Check `hatago.plugin.json` syntax
   - Verify TypeScript compilation
   - Check environment variables

2. **Tool registration failures**
   - Validate input schema format
   - Check for naming conflicts
   - Verify tool handler function

3. **Installation errors**
   - Ensure repository is public
   - Check GitHub topics
   - Verify release tags

### Debug Mode

Enable verbose logging:

```bash
# Run with debug output
HATAGO_DEBUG=true hatago dev

# Test plugin loading
hatago validate-plugin hatago.plugin.json --verbose

# Check plugin registration
hatago info my-plugin --debug
```

### Getting Help

- **GitHub Issues**: Report bugs and feature requests
- **Discussions**: Community support and questions
- **Documentation**: Comprehensive guides and references
- **Examples**: Sample plugins and code snippets

---

This guide provides a complete foundation for publishing high-quality Hatago plugins. Follow these practices to create plugins that are reliable, secure, and valuable to the community.
