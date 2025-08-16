# Hatago 🏮

A lightweight, fast, and simple MCP (Model Context Protocol) server framework with plugin architecture.

## Features

- 🚀 **Multi-runtime Support**: Works on Node.js, Cloudflare Workers, Deno, and Bun
- 🔌 **Plugin Architecture**: Extend functionality through plugins
- 🔒 **Security First**: Built-in OAuth 2.1 support with PII masking
- 📡 **Dual Transport**: Both stdio and HTTP transports for MCP
- ⚡ **High Performance**: Minimal core with optimized plugin system
- 🛠️ **Developer Friendly**: TypeScript-first with excellent DX

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Visit http://localhost:8787/health
```

## Packages

This is a monorepo containing multiple packages:

- **`@hatago/core`** - Core framework and plugin system
- **`@hatago/adapter-node`** - Node.js runtime adapter
- **`@hatago/adapter-workers`** - Cloudflare Workers adapter
- **`@hatago/cli`** - Command-line interface
- **`@hatago/config`** - Configuration management
- **Various plugins** - Rate limiting, KV storage, logging, etc.

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed documentation and development guidelines.

## License

MIT
