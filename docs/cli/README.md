# Hatago CLI Reference

Command-line interface for creating and managing Hatago MCP servers.

## Installation

```bash
npm install -g @hatago/cli
# or
pnpm add -g @hatago/cli
# or use without installing
npx @hatago/cli --help
```

## Commands

### `hatago init`

Initialize a new Hatago project.

```bash
hatago init <project-name> [options]
```

**Options:**

- `--template, -t <type>` - Project template (basic|node-http|workers|stdio-only)
- `--force, -f` - Overwrite existing directory
- `--skip-install` - Skip dependency installation

**Examples:**

```bash
hatago init my-server
hatago init my-server --template workers
hatago init my-server --force --skip-install
```

### `hatago dev`

Start development server with hot reload.

```bash
hatago dev [options]
```

**Options:**

- `--port, -p <port>` - Server port (default: 8787)
- `--host, -H <hostname>` - Server hostname (default: localhost)
- `--stdio` - Use stdio transport instead of HTTP
- `--watch, -w` - Watch for file changes
- `--env <file>` - Load environment from file

**Examples:**

```bash
hatago dev
hatago dev --port 3000
hatago dev --stdio
```

### `hatago create-plugin`

Generate a new plugin.

```bash
hatago create-plugin <plugin-name> [options]
```

**Options:**

- `--template, -t <name>` - Plugin template (basic|mcp-wrapper|oauth)
- `--output, -o <dir>` - Output directory (default: src/plugins)
- `--interactive, -i` - Interactive mode

**Examples:**

```bash
hatago create-plugin weather-api
hatago create-plugin github --template oauth
hatago create-plugin my-tool --interactive
```

### `hatago config`

Manage configuration files.

```bash
hatago config <command> [options]
```

**Subcommands:**

- `init` - Create new configuration file
- `validate` - Validate configuration
- `show` - Display current configuration

**Examples:**

```bash
hatago config init
hatago config validate
hatago config show
```

### `hatago add-server`

Add external MCP server to configuration.

```bash
hatago add-server <endpoint> [options]
```

**Options:**

- `--id <id>` - Server identifier
- `--namespace <ns>` - Tool namespace
- `--test` - Test connection before adding

**Examples:**

```bash
hatago add-server http://localhost:3001/mcp --id external
hatago add-server http://api.example.com/mcp --namespace api --test
```

### `hatago scaffold`

Generate boilerplate code.

```bash
hatago scaffold <template> [name] [options]
```

**Templates:**

- `routes` - HTTP route handlers
- `tools` - MCP tool implementations
- `tests` - Test files
- `docker` - Dockerfile

**Examples:**

```bash
hatago scaffold routes
hatago scaffold tools weather-tools
hatago scaffold docker
```

## Global Options

All commands support these global options:

- `--version, -v` - Show version
- `--help, -h` - Show help
- `--verbose` - Verbose output
- `--quiet` - Suppress output
- `--config <path>` - Use custom config file

## Configuration File

The CLI uses `hatago.config.json` for project configuration:

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "runtime": "node",
  "plugins": ["@hatago/plugin-hello-hatago", "./src/plugins/custom.ts"],
  "server": {
    "port": 8787,
    "hostname": "localhost"
  }
}
```

## Environment Variables

- `HATAGO_CONFIG` - Path to config file
- `DEBUG` - Enable debug output (`DEBUG=hatago:*`)
- `NODE_ENV` - Environment mode (development|production)

## Examples

### Quick Start

```bash
# Create new project
hatago init my-project
cd my-project

# Start development
hatago dev

# Add a plugin
hatago create-plugin my-feature

# Build for production
npm run build
```

### Claude Desktop Integration

```bash
# Create stdio-compatible server
hatago init claude-server --template stdio-only

# Generate Claude Desktop config
hatago config claude-desktop

# Output can be added to Claude Desktop settings
```

### Docker Deployment

```bash
# Generate Dockerfile
hatago scaffold docker

# Build and run
docker build -t my-mcp-server .
docker run -p 8787:8787 my-mcp-server
```

## Troubleshooting

### Common Issues

**Port in use:**

```bash
hatago dev --port 3001
```

**Module not found:**

```bash
npm install
hatago dev
```

**Debug mode:**

```bash
DEBUG=hatago:* hatago dev
```

## Related Documentation

- [Getting Started Guide](../getting-started.md)
- [Plugin Development](../guides/plugin-development.md)
- [API Reference](../api-reference.md)
