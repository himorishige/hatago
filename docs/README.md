# Hatago Documentation

Welcome to the Hatago documentation! Hatago is a lightweight, fast, and simple remote MCP (Model Context Protocol) server built with functional programming principles.

## 📚 Documentation Structure

### Getting Started
- [**Quick Start Guide**](./getting-started.md) - Get up and running with Hatago in minutes
- [**Architecture Overview**](./architecture.md) - Understand Hatago's functional architecture

### API Reference
- [**Core API Reference**](./api-reference.md) - Core framework APIs and interfaces
- [**CLI Reference**](./cli/README.md) - Command-line interface documentation

### Development Guides
- [**Plugin Development**](./guides/plugin-development.md) - Create custom Hatago plugins
- [**External MCP Servers**](./guides/external-mcp-servers.md) - Integrate external MCP servers
- [**Publishing Plugins**](./guides/publishing-plugins.md) - Share your plugins with the community

### Reference Documentation
- [**Plugin Specification**](./reference/plugin-specification.md) - Technical plugin specification
- [**Logging**](./reference/logging.md) - Logging system and configuration

### Operations
- [**Observability**](./observability/) - Monitoring, metrics, and alerting setup

## 🚀 Quick Links

### For Users
1. **New to Hatago?** Start with the [Getting Started Guide](./getting-started.md)
2. **Building a plugin?** Check out the [Plugin Development Guide](./guides/plugin-development.md)
3. **Need CLI help?** See the [CLI Reference](./cli/README.md)

### For Contributors
1. **Architecture** - Understand our [functional architecture](./architecture.md)
2. **API Reference** - Review the [Core APIs](./api-reference.md)
3. **Contributing** - See [CONTRIBUTING.md](../CONTRIBUTING.md) in the root directory

## 📦 Package Documentation

Each package has its own documentation:

- [`@hatago/core`](../packages/core/README.md) - Core framework
- [`@hatago/cli`](../packages/cli/README.md) - CLI tools
- [`@hatago/adapter-node`](../packages/adapter-node/README.md) - Node.js adapter
- [`@hatago/adapter-workers`](../packages/adapter-workers/README.md) - Cloudflare Workers adapter
- [`@hatago/hono-mcp`](../packages/hono-mcp/README.md) - Hono MCP transport

## 🔧 Configuration Examples

Find configuration examples in the [`observability`](./observability/) directory:
- Docker Compose setup for monitoring
- Prometheus configuration
- Grafana dashboards
- AlertManager rules

## 📖 Documentation Conventions

### Code Examples
- All code examples use TypeScript
- Examples follow functional programming patterns
- Factory functions use `create*` naming convention

### Terminology
- **MCP** - Model Context Protocol
- **Plugin** - Hatago extension module
- **Tool** - MCP tool exposed by plugins
- **Resource** - MCP resource provided by plugins

## 🤝 Getting Help

- **Issues**: [GitHub Issues](https://github.com/himorishige/hatago/issues)
- **Discussions**: [GitHub Discussions](https://github.com/himorishige/hatago/discussions)
- **Contributing**: [Contribution Guide](../CONTRIBUTING.md)

## 📄 License

Hatago is licensed under the MIT License. See [LICENSE](../LICENSE) for details.