# Hatago 🏮

A lightweight, fast, and extensible MCP (Model Context Protocol) server framework with plugin architecture.

[![npm version](https://badge.fury.io/js/@hatago%2Fcore.svg)](https://www.npmjs.com/package/@hatago/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/himorishige/hatago)

## Overview

Hatago is a production-ready MCP server framework designed for modern JavaScript runtimes. It provides a minimal core with powerful plugin architecture, enabling you to build scalable, secure MCP servers that run anywhere. Hatago is built on [Hono](https://hono.dev/) as its core framework.

## ✨ Features

- **🌐 Runtime Agnostic**: Works on Node.js, Cloudflare Workers, Deno, and Bun
- **🔌 Plugin Architecture**: Extensible via plugins, keep core minimal
- **📡 Dual Transport**: Supports both stdio and HTTP transports
- **🛡️ Security First**: Built-in OAuth 2.1, input validation, and security plugins
- **📊 Observability**: Structured logging, metrics, and tracing support
- **🚀 Performance**: Optimized for fast startup and low memory usage
- **🛠️ Developer Experience**: TypeScript-first with excellent tooling
- **✅ Production Ready**: Comprehensive test coverage, stable builds, and zero lint warnings
- **🔍 Quality Assured**: 29+ automated tests with 77-100% coverage on core modules

## 🚀 Quick Start

### Using CLI (Recommended)

```bash
# Install CLI globally
npm install -g @hatago/cli

# Create new project
hatago init my-mcp-server --template node-http

# Start development
cd my-mcp-server
npm run dev
```

### Manual Setup

```bash
# Install core packages
npm install @hatago/core @hatago/adapter-node

# Create basic server
echo 'import { createApp } from "@hatago/adapter-node"
import { serve } from "@hono/node-server"

const { app } = await createApp({
  name: "my-server",
  version: "1.0.0"
})

serve({ fetch: app.fetch, port: 8787 })
console.log("Server running on http://localhost:8787")' > server.js

# Start server
node server.js
```

### Test Your Server

```bash
# Health check
curl http://localhost:8787/health

# MCP initialization
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# List available tools
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Available Built-in Tools

- **`hello_hatago`**: Demo tool with progress notifications
- **`logs_query`**: Query structured logs with filtering
- **`logs_config`**: Get/update logging configuration
- **`security_verify`**: Plugin signature verification
- **`security_generate_key`**: Generate test key pairs
- **`security_sign_test`**: Sign test data (development)
- **`security_status`**: Security system status

## 📦 Packages

### Core Framework

| Package                           | Description                      | npm                                                                                                 |
| --------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`@hatago/core`](./packages/core) | Core framework and plugin system | [![npm](https://img.shields.io/npm/v/@hatago/core.svg)](https://www.npmjs.com/package/@hatago/core) |

### Runtime Adapters

| Package                                                 | Description                | npm                                                                                                                       |
| ------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`@hatago/adapter-node`](./packages/adapter-node)       | Node.js runtime adapter    | [![npm](https://img.shields.io/npm/v/@hatago/adapter-node.svg)](https://www.npmjs.com/package/@hatago/adapter-node)       |
| [`@hatago/adapter-workers`](./packages/adapter-workers) | Cloudflare Workers adapter | [![npm](https://img.shields.io/npm/v/@hatago/adapter-workers.svg)](https://www.npmjs.com/package/@hatago/adapter-workers) |

### Development Tools

| Package                                      | Description              | npm                                                                                                     |
| -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| [`@hatago/cli`](./packages/cli)              | Command line interface   | [![npm](https://img.shields.io/npm/v/@hatago/cli.svg)](https://www.npmjs.com/package/@hatago/cli)       |
| [`@hatago/config`](./packages/hatago-config) | Configuration management | [![npm](https://img.shields.io/npm/v/@hatago/config.svg)](https://www.npmjs.com/package/@hatago/config) |

### Official Plugins

| Package                                                                       | Description                   | npm                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@hatago/plugin-rate-limit`](./packages/plugin-rate-limit)                   | Token bucket rate limiting    | [![npm](https://img.shields.io/npm/v/@hatago/plugin-rate-limit.svg)](https://www.npmjs.com/package/@hatago/plugin-rate-limit)                   |
| [`@hatago/plugin-concurrency-limiter`](./packages/plugin-concurrency-limiter) | Advanced concurrency control  | [![npm](https://img.shields.io/npm/v/@hatago/plugin-concurrency-limiter.svg)](https://www.npmjs.com/package/@hatago/plugin-concurrency-limiter) |
| [`@hatago/plugin-kv`](./packages/plugin-kv)                                   | Key-value storage abstraction | [![npm](https://img.shields.io/npm/v/@hatago/plugin-kv.svg)](https://www.npmjs.com/package/@hatago/plugin-kv)                                   |
| [`@hatago/plugin-logger`](./packages/plugin-logger)                           | Structured logging            | [![npm](https://img.shields.io/npm/v/@hatago/plugin-logger.svg)](https://www.npmjs.com/package/@hatago/plugin-logger)                           |

## 🏗️ Architecture

Hatago follows a layered architecture:

```
┌─────────────────────────────────────────┐
│                 Your App                │
├─────────────────────────────────────────┤
│              Plugins                    │
├─────────────────────────────────────────┤
│            @hatago/core                 │
├─────────────────────────────────────────┤
│     Runtime Adapters (Node/Workers)    │
├─────────────────────────────────────────┤
│       Transport (stdio/HTTP)           │
└─────────────────────────────────────────┘
```

## 🎯 Use Cases

### Claude Desktop Integration

Create MCP servers for Claude Desktop:

```typescript
// stdio server for Claude Desktop
import { createApp } from '@hatago/adapter-node'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const { server } = await createApp({
  name: 'claude-tools',
  mode: 'stdio',
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

### API Integration Server

Build HTTP-based MCP servers:

```typescript
// HTTP server for API integration
import { createApp } from '@hatago/adapter-node'
import { rateLimitPlugin } from '@hatago/plugin-rate-limit'

const { app } = await createApp({
  plugins: [rateLimitPlugin({ requestsPerMinute: 60 })],
})
```

### Edge Computing

Deploy to Cloudflare Workers:

```typescript
// workers/mcp-server.ts
import { createApp } from '@hatago/adapter-workers'

export default {
  async fetch(request: Request, env: Env) {
    const { app } = await createApp({ env })
    return app?.fetch(request, env) ?? new Response('Error', { status: 500 })
  },
}
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
# Clone repository
git clone https://github.com/himorishige/hatago.git
cd hatago

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development server
pnpm --filter @hatago/adapter-node dev
```

### Project Structure

```
hatago/
├── packages/
│   ├── core/                 # Core framework
│   ├── adapter-node/         # Node.js adapter
│   ├── adapter-workers/      # Workers adapter
│   ├── cli/                  # CLI tools
│   ├── hatago-config/        # Configuration
│   └── plugin-*/             # Official plugins
├── examples/                 # Example projects
├── docs/                     # Documentation
└── tests/                    # Integration tests
```

## 🚀 Release Process

Hatago uses [Changesets](https://github.com/changesets/changesets) for version management and automated releases.

### Creating a Release

1. **Make your changes** and create a PR
2. **Add a changeset** describing your changes:

   ```bash
   pnpm changeset
   ```

   - Select which packages are affected
   - Choose the appropriate version bump (major/minor/patch)
   - Write a clear description of the changes
   - Note: `@hatago/hono-mcp` is excluded from releases (temporary package until @hono/mcp update)

3. **Submit your PR** - the CI will automatically check for changesets
4. **Merge to main** - this triggers the release workflow:
   - Creates a "Version Packages" PR with updated versions and changelogs
   - When the Version PR is merged, packages are automatically published to npm
   - GitHub releases are created automatically

### Manual Release (if needed)

```bash
# Build packages
pnpm build

# Create version bump and update changelogs
pnpm changeset version

# Install updated dependencies
pnpm install

# Publish to npm
pnpm changeset publish
```

### Release Notes

All releases include:

- 📦 **Automated changelogs** with GitHub links
- 🏷️ **Git tags** for each published package
- 📝 **GitHub releases** with package links
- 🔔 **Slack notifications** (if configured)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and add tests
4. **Add a changeset**: `pnpm changeset` (if your changes affect packages)
5. Run tests: `pnpm test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Submit pull request

## 📖 Documentation

- [Core Framework](./packages/core/README.md) - Plugin architecture and core concepts
- [Node.js Adapter](./packages/adapter-node/README.md) - Node.js integration guide
- [Workers Adapter](./packages/adapter-workers/README.md) - Cloudflare Workers deployment
- [CLI Reference](./packages/cli/README.md) - Command line tools
- [Plugin Development](./docs/plugin-development-guide.md) - Creating custom plugins
- [Examples](./examples/) - Complete example projects

## 🛡️ Security

Hatago implements security best practices by default:

- **OAuth 2.1 Support**: Built-in authentication and authorization
- **Input Validation**: Request validation and sanitization
- **PII Masking**: Automatic detection and masking of sensitive data
- **Rate Limiting**: Protection against abuse and DoS attacks
- **Security Headers**: CORS, CSP, and other security headers

Report security vulnerabilities to [security@hatago.dev](mailto:security@hatago.dev).

## 📊 Status

- ✅ **Core Framework**: Stable (77-100% test coverage, zero lint warnings)
- ✅ **Node.js Adapter**: Production ready (29+ tests passing)
- ✅ **Workers Adapter**: Production ready (full TypeScript support)
- ✅ **Build System**: Stable (17/17 packages building successfully)
- ✅ **Plugin Security**: Security plugins with signature verification
- 🚧 **CLI Tools**: Beta (functional, expanding features)
- 🚧 **Plugin Ecosystem**: Growing (7+ built-in tools available)

## 🗺️ Roadmap

- [ ] **Additional Runtimes**: Deno and Bun adapters
- [ ] **Plugin Marketplace**: Official plugin registry
- [ ] **Visual Designer**: GUI for MCP server configuration
- [ ] **Enterprise Features**: Advanced monitoring and scaling
- [ ] **GraphQL Support**: Alternative to JSON-RPC transport

## 📄 License

MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol that powers Hatago
- [Hono](https://hono.dev/) - The web framework that Hatago builds upon
- [Anthropic](https://www.anthropic.com/) - For Claude and MCP innovation
- [Cloudflare](https://cloudflare.com/) - For Workers runtime support

---

<div align="center">
  <p>Built with ❤️ for the MCP ecosystem</p>
  <p>
    <a href="https://github.com/himorishige/hatago">GitHub</a> •
    <a href="https://www.npmjs.com/org/hatago">npm</a> •
  </p>
</div>
