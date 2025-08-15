# Hatago CLI Documentation

The Hatago CLI is a powerful command-line interface for creating, managing, and developing Hatago MCP (Model Context Protocol) servers and plugins.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Templates](#templates)
- [Development Workflow](#development-workflow)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- Node.js 18 or higher
- pnpm (recommended) or npm

### Install globally

```bash
npm install -g hatago-cli
# or
pnpm add -g hatago-cli
```

### Install locally in project

```bash
npm install --save-dev hatago-cli
# or
pnpm add -D hatago-cli
```

### Verify installation

```bash
hatago --version
hatago --help
```

## Quick Start

### 1. Create a new Hatago project

```bash
# Create a basic project
hatago init my-mcp-server

# Create with proxy support for external MCP servers
hatago init my-proxy-server --template with-proxy

# Create plugin-only project
hatago init my-plugins --template plugin-only
```

### 2. Start development

```bash
cd my-mcp-server
pnpm install
hatago dev
```

### 3. Create plugins

```bash
# Create a new plugin interactively
hatago create-plugin weather-api --interactive

# Create from template with defaults
hatago create-plugin calculator-tool
```

### 4. Add external MCP servers

```bash
# Add an external server
hatago add-server http://api.example.com/mcp --id external-api --namespace ext

# Test connection before adding
hatago add-server http://localhost:8080/mcp --test --dry
```

## Commands

### Global Options

- `--verbose, -v`: Enable verbose output for debugging
- `--json`: Output results in JSON format for scripting
- `--help, -h`: Show help for any command

### `hatago init`

Initialize a new Hatago project.

```bash
hatago init <project-name> [options]
```

**Options:**

- `--template, -t <type>`: Project template (basic|with-proxy|plugin-only)
- `--name, -n <name>`: Project name (defaults to directory name)
- `--port, -p <port>`: Server port (default: 8787)
- `--force, -f`: Overwrite existing directory
- `--skip-install`: Skip dependency installation
- `--pm <manager>`: Package manager (npm|pnpm|yarn)

**Examples:**

```bash
# Basic server
hatago init my-server

# Server with external MCP proxy support
hatago init my-server --template with-proxy

# Plugin-only project
hatago init my-plugins --template plugin-only --port 3000

# Force overwrite existing directory
hatago init existing-dir --force
```

### `hatago dev`

Start development server with hot reload and file watching.

```bash
hatago dev [options]
```

**Options:**

- `--port, -p <port>`: Server port
- `--hostname, -H <hostname>`: Server hostname
- `--watch, -w <paths...>`: Additional paths to watch
- `--inspect`: Enable Node.js debugger
- `--inspect-port <port>`: Debugger port (default: 9229)
- `--no-clear-screen`: Disable clearing screen on restart
- `--open`: Open browser after server starts

**Examples:**

```bash
# Basic development server
hatago dev

# Custom port and hostname
hatago dev --port 3000 --hostname 0.0.0.0

# Enable debugging
hatago dev --inspect --open

# Watch additional directories
hatago dev --watch config --watch templates
```

### `hatago config`

Manage Hatago configuration files.

#### `hatago config init`

Create a new configuration file.

```bash
hatago config init [options]
```

**Options:**

- `--force, -f`: Overwrite existing configuration

#### `hatago config validate`

Validate configuration file.

```bash
hatago config validate [options]
```

**Options:**

- `--fix`: Automatically fix common issues

#### `hatago config doctor`

Run comprehensive configuration diagnostics.

```bash
hatago config doctor
```

#### `hatago config get`

Get configuration values.

```bash
hatago config get [path]
```

**Examples:**

```bash
# Get entire configuration
hatago config get

# Get specific value
hatago config get server.port

# Get nested configuration
hatago config get proxy.servers
```

### `hatago create-plugin`

Create a new Hatago plugin from templates.

```bash
hatago create-plugin <plugin-name> [options]
```

**Options:**

- `--template, -t <name>`: Template name to use
- `--output, -o <dir>`: Output directory (default: src/plugins)
- `--interactive, -i`: Interactive configuration mode
- `--dry`: Show what would be created without creating files
- `--no-tests`: Skip test file generation
- `--no-readme`: Skip README file generation
- `--force, -f`: Overwrite existing plugin

**Examples:**

```bash
# Basic plugin
hatago create-plugin weather-api

# Interactive mode
hatago create-plugin ai-tool --interactive

# Custom output directory
hatago create-plugin utils --output lib/plugins

# Preview without creating
hatago create-plugin test-plugin --dry
```

### `hatago scaffold`

Generate code from templates (more general than create-plugin).

```bash
hatago scaffold [template] [name] [options]
```

**Options:**

- `--template, -t <name>`: Template name
- `--output, -o <dir>`: Output directory
- `--category, -c <category>`: Filter templates by category
- `--list, -l`: List available templates
- `--info`: Show detailed template information
- `--interactive, -i`: Interactive configuration mode
- `--context <file>`: Load context from JSON file
- `--dry`: Preview without creating files
- `--force, -f`: Overwrite existing files

**Examples:**

```bash
# List all templates
hatago scaffold --list

# Show template details
hatago scaffold --info basic

# Generate from template
hatago scaffold basic my-component

# Interactive mode with context file
hatago scaffold advanced my-api --interactive --context ./config.json
```

### `hatago add-server`

Add external MCP server to configuration.

```bash
hatago add-server <endpoint> [options]
```

**Options:**

- `--id, -i <id>`: Server identifier
- `--namespace, -n <namespace>`: Tool namespace
- `--description, -d <description>`: Server description
- `--timeout, -t <timeout>`: Request timeout in milliseconds
- `--auth-type <type>`: Authentication type (bearer|basic|custom)
- `--auth-token <token>`: Bearer token or API key
- `--auth-username <username>`: Username for basic auth
- `--auth-password <password>`: Password for basic auth
- `--test`: Test connection before adding
- `--include <tools...>`: Include specific tools (glob patterns)
- `--exclude <tools...>`: Exclude specific tools (glob patterns)
- `--rename <mapping>`: Rename tools (format: old=new,old2=new2)
- `--health-check`: Enable health checks
- `--interactive`: Interactive configuration mode
- `--dry`: Show configuration changes without saving

**Examples:**

```bash
# Basic server addition
hatago add-server http://api.example.com/mcp

# With authentication
hatago add-server https://api.example.com/mcp \\
  --auth-type bearer \\
  --auth-token "your-api-token"

# With tool filtering
hatago add-server http://localhost:8080/mcp \\
  --include "calc.*" "time.*" \\
  --exclude "debug.*"

# Interactive mode with connection test
hatago add-server http://localhost:8080/mcp --interactive --test
```

## Configuration

### Configuration File

Hatago uses `hatago.config.jsonc` for configuration. The file supports JSON with comments.

```jsonc
{
  // JSON Schema for IDE support
  "$schema": "https://hatago.dev/schema/config.json",

  // Server configuration
  "server": {
    "port": 8787,
    "hostname": "localhost",
    "cors": true,
    "timeout": 30000,
  },

  // External MCP server proxy configuration
  "proxy": {
    "servers": [
      {
        "id": "weather-api",
        "endpoint": "https://api.weather.com/mcp",
        "namespace": "weather",
        "auth": {
          "type": "bearer",
          "token": "${WEATHER_API_TOKEN}",
        },
      },
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "error",
  },

  // Logging configuration
  "logging": {
    "level": "info",
    "format": "pretty",
    "output": "console",
  },

  // Security configuration
  "security": {
    "requireAuth": false,
    "allowedOrigins": ["*"],
  },
}
```

### Environment Variables

Configuration supports environment variable expansion:

```jsonc
{
  "proxy": {
    "servers": [
      {
        "endpoint": "${API_ENDPOINT:http://localhost:8080}",
        "auth": {
          "token": "${API_TOKEN}",
        },
      },
    ],
  },
}
```

Variables are expanded using `${VAR_NAME:default_value}` syntax.

### Configuration Schema

The configuration is validated against a strict schema. Use `hatago config validate` to check for errors.

## Templates

### Template System

Hatago uses Handlebars templates for code generation. Templates are organized by category:

- `plugins/`: Plugin templates
- `projects/`: Project templates
- `examples/`: Example code templates

### Available Templates

#### Plugin Templates

- **basic**: Full-featured plugin with tools, resources, and HTTP routes
- **tool**: Simple tool-providing plugin
- **resource**: Resource-providing plugin
- **middleware**: HTTP middleware plugin

#### Project Templates

- **basic**: Simple MCP server
- **with-proxy**: Server with external MCP proxy support
- **plugin-only**: Plugin-based architecture

### Custom Templates

Create your own templates by adding them to the `templates/` directory:

```
templates/
├── my-category/
│   └── my-template/
│       ├── template.config.json
│       ├── main.hbs
│       └── readme.hbs
```

**template.config.json:**

```json
{
  "name": "my-template",
  "displayName": "My Custom Template",
  "description": "A custom template for my use case",
  "category": "my-category",
  "files": [
    {
      "template": "main.hbs",
      "output": "{{kebabCase name}}.ts",
      "description": "Main file"
    }
  ],
  "prompts": [
    {
      "name": "description",
      "type": "input",
      "message": "Description:",
      "default": "A custom component"
    }
  ]
}
```

### Template Helpers

Available Handlebars helpers:

- **String transformations**: `{{camelCase name}}`, `{{kebabCase name}}`, `{{snakeCase name}}`, `{{titleCase name}}`
- **Dates**: `{{timestamp}}`, `{{date "short"}}`
- **Conditionals**: `{{#if condition}}`, `{{#unless condition}}`
- **Comparisons**: `{{#if (eq a b)}}`, `{{#if (gt a b)}}`
- **Arrays**: `{{#each items}}`, `{{length array}}`, `{{join array ", "}}`
- **JSON**: `{{json object}}`

## Development Workflow

### Typical Development Cycle

1. **Initialize project**

   ```bash
   hatago init my-project --template with-proxy
   cd my-project
   pnpm install
   ```

2. **Start development server**

   ```bash
   hatago dev --open
   ```

3. **Create plugins**

   ```bash
   hatago create-plugin weather-api --interactive
   ```

4. **Add external servers**

   ```bash
   hatago add-server https://api.example.com/mcp --test
   ```

5. **Validate configuration**

   ```bash
   hatago config validate --fix
   ```

6. **Build and deploy**
   ```bash
   pnpm build
   pnpm start
   ```

### Project Structure

```
my-project/
├── src/
│   ├── index.ts              # Main server entry
│   └── plugins/              # Custom plugins
│       ├── weather-api.ts
│       └── calculator.ts
├── hatago.config.jsonc       # Configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

Run tests with:

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test --coverage
```

## Advanced Usage

### JSON Output Mode

Use `--json` flag for scripting:

```bash
# Get configuration as JSON
CONFIG=$(hatago config get --json)
echo $CONFIG | jq '.server.port'

# List templates as JSON
TEMPLATES=$(hatago scaffold --list --json)
echo $TEMPLATES | jq '.templates[].name'
```

### Batch Operations

```bash
# Create multiple plugins
for plugin in weather calculator calendar; do
  hatago create-plugin $plugin --template basic
done

# Add multiple servers
hatago add-server http://api1.example.com/mcp --id api1 --namespace api1
hatago add-server http://api2.example.com/mcp --id api2 --namespace api2
```

### Configuration Management

```bash
# Backup configuration
cp hatago.config.jsonc hatago.config.backup.jsonc

# Validate after changes
hatago config validate

# Run comprehensive diagnostics
hatago config doctor
```

### Template Development

```bash
# Test template generation
hatago scaffold my-template test-output --dry

# Validate template
hatago scaffold --info my-template
```

## Troubleshooting

### Common Issues

#### "Template not found"

- Check template exists: `hatago scaffold --list`
- Verify template name spelling
- Ensure you're in a Hatago project directory

#### "Configuration validation failed"

- Run diagnostics: `hatago config doctor`
- Auto-fix issues: `hatago config validate --fix`
- Check JSON syntax in config file

#### "Module not found" errors

- Ensure dependencies are installed: `pnpm install`
- Rebuild packages: `pnpm build`
- Check Node.js version compatibility

#### Server won't start

- Check port availability: `hatago config get server.port`
- Verify configuration: `hatago config validate`
- Check logs with verbose mode: `hatago dev --verbose`

### Debug Mode

Enable verbose output for debugging:

```bash
hatago --verbose <command>
# or
HATAGO_VERBOSE=true hatago <command>
```

### Getting Help

```bash
# General help
hatago --help

# Command-specific help
hatago <command> --help

# Show version
hatago --version
```

### Environment Variables

- `HATAGO_VERBOSE`: Enable verbose output
- `HATAGO_JSON_OUTPUT`: Force JSON output mode
- `NODE_ENV`: Set to 'development' or 'production'

### Performance Tips

1. **Use specific watch paths** with `hatago dev --watch`
2. **Skip optional files** when generating: `--no-tests --no-readme`
3. **Use dry run** to preview: `--dry`
4. **Enable caching** for large projects
5. **Use namespace prefixes** to avoid tool conflicts

### Contributing

To contribute to Hatago CLI:

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Run the test suite: `pnpm test`
5. Submit pull request

### Support

- **Documentation**: https://hatago.dev/docs
- **Issues**: https://github.com/himorishige/hatago/issues
- **Discussions**: https://github.com/himorishige/hatago/discussions

---

_This documentation covers Hatago CLI v0.1.0. For the latest updates, visit [hatago.dev](https://hatago.dev)._
