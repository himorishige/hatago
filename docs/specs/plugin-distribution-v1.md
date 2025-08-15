# Hatago Plugin Distribution System v1.0 Specification

## Overview

This specification defines a decentralized plugin distribution system for Hatago MCP servers, using GitHub as the primary hosting platform. This approach allows developers to publish and share plugins without requiring a centralized registry, while maintaining consistency and discoverability.

## Table of Contents

- [Plugin Package Format](#plugin-package-format)
- [Repository Structure](#repository-structure)
- [Metadata Schema](#metadata-schema)
- [Discovery Mechanism](#discovery-mechanism)
- [Installation Process](#installation-process)
- [Versioning and Releases](#versioning-and-releases)
- [Security Considerations](#security-considerations)
- [Future Migration Path](#future-migration-path)

## Plugin Package Format

### Directory Structure

```
my-hatago-plugin/
├── src/
│   ├── index.ts           # Main plugin entry point
│   └── types.ts           # Type definitions
├── tests/
│   └── plugin.test.ts     # Unit tests
├── docs/
│   ├── README.md          # Plugin documentation
│   └── api.md             # API reference
├── examples/
│   └── usage.ts           # Usage examples
├── hatago.plugin.json     # Plugin metadata (required)
├── package.json           # NPM package configuration
├── tsconfig.json          # TypeScript configuration
└── LICENSE                # License file
```

### Required Files

1. **`hatago.plugin.json`** - Plugin metadata and configuration
2. **`src/index.ts`** - Main plugin implementation
3. **`README.md`** - Documentation and usage instructions
4. **`package.json`** - NPM-compatible package definition
5. **`LICENSE`** - License information

## Metadata Schema

### `hatago.plugin.json`

```json
{
  "$schema": "https://hatago.dev/schemas/plugin.json",
  "name": "weather-api",
  "displayName": "Weather API Plugin",
  "version": "1.2.0",
  "description": "Provides weather information through MCP tools",
  "author": "John Doe <john@example.com>",
  "license": "MIT",
  "homepage": "https://github.com/johndoe/hatago-weather-plugin",
  "repository": {
    "type": "git",
    "url": "https://github.com/johndoe/hatago-weather-plugin.git"
  },
  "keywords": ["weather", "api", "tools"],
  "categories": ["data-sources", "apis"],
  "hatago": {
    "compatibility": ">=0.1.0",
    "type": "plugin",
    "main": "src/index.ts",
    "exports": {
      "tools": [
        {
          "name": "get-weather",
          "description": "Get current weather for a location"
        },
        {
          "name": "get-forecast",
          "description": "Get weather forecast for a location"
        }
      ],
      "resources": [
        {
          "uri": "weather://config",
          "description": "Weather API configuration"
        }
      ],
      "routes": [
        {
          "path": "/weather",
          "method": "GET",
          "description": "Weather information endpoint"
        }
      ]
    },
    "dependencies": {
      "env": ["WEATHER_API_KEY"]
    },
    "configuration": {
      "apiKey": {
        "type": "string",
        "required": true,
        "description": "Weather API key"
      }
    }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@hatago/types": "^0.1.0",
    "node-fetch": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Schema Fields

#### Core Metadata

- `name` (string, required) - Plugin name (kebab-case, unique)
- `displayName` (string, required) - Human-readable name
- `version` (string, required) - Semantic version
- `description` (string, required) - Brief description
- `author` (string, required) - Author information
- `license` (string, required) - License identifier
- `homepage` (string, optional) - Plugin homepage URL
- `repository` (object, required) - Repository information
- `keywords` (string[], optional) - Search keywords
- `categories` (string[], optional) - Plugin categories

#### Hatago-Specific Configuration

- `hatago.compatibility` (string, required) - Compatible Hatago versions
- `hatago.type` (string, required) - Always "plugin"
- `hatago.main` (string, required) - Entry point file
- `hatago.exports` (object, optional) - Exported functionality
- `hatago.dependencies` (object, optional) - External dependencies
- `hatago.configuration` (object, optional) - Configuration schema

## Repository Structure

### GitHub Topics

All plugin repositories must include the following topics:

- `hatago-plugin` (required)
- `mcp` (required)
- Additional descriptive topics

### Repository Naming Convention

Recommended naming patterns:

- `hatago-{plugin-name}-plugin`
- `{plugin-name}-hatago-plugin`
- `hatago-{plugin-name}`

Examples:

- `hatago-weather-plugin`
- `database-hatago-plugin`
- `hatago-auth`

### Branch Strategy

- `main` - Stable releases
- `develop` - Development branch
- `feature/*` - Feature branches
- `release/*` - Release preparation

## Discovery Mechanism

### GitHub Search API

Plugins are discovered using GitHub's search API with the following query:

```
topic:hatago-plugin topic:mcp
```

Additional filters:

- `language:typescript`
- `stars:>0`
- `pushed:>YYYY-MM-DD`

### Search Endpoint

```
GET https://api.github.com/search/repositories?q=topic:hatago-plugin+topic:mcp&sort=stars&order=desc
```

### Registry Index (Future)

A lightweight index service will periodically crawl GitHub and maintain a searchable catalog:

```json
{
  "plugins": [
    {
      "name": "weather-api",
      "repository": "github:johndoe/hatago-weather-plugin",
      "version": "1.2.0",
      "description": "Weather information plugin",
      "stars": 42,
      "lastUpdated": "2025-08-15T10:30:00Z",
      "verified": true
    }
  ]
}
```

## Installation Process

### CLI Commands

```bash
# Install from GitHub repository
hatago install github:johndoe/hatago-weather-plugin

# Install specific version
hatago install github:johndoe/hatago-weather-plugin@v1.2.0

# Install from branch
hatago install github:johndoe/hatago-weather-plugin#develop

# List installed plugins
hatago list

# Update plugin
hatago update weather-api

# Uninstall plugin
hatago uninstall weather-api
```

### Installation Flow

1. **Repository Resolution**
   - Parse repository URL
   - Verify repository exists and is accessible
   - Check for required files

2. **Metadata Validation**
   - Download and parse `hatago.plugin.json`
   - Validate against schema
   - Check compatibility

3. **Dependency Resolution**
   - Check Node.js version requirements
   - Verify environment variables
   - Install NPM dependencies

4. **Plugin Integration**
   - Clone or download source code
   - Compile TypeScript (if needed)
   - Register plugin in local registry
   - Update configuration

### Local Plugin Registry

```json
{
  "plugins": {
    "weather-api": {
      "name": "weather-api",
      "version": "1.2.0",
      "source": "github:johndoe/hatago-weather-plugin",
      "installedAt": "2025-08-15T10:30:00Z",
      "path": "~/.hatago/plugins/weather-api",
      "enabled": true
    }
  }
}
```

## Versioning and Releases

### Semantic Versioning

All plugins must follow [Semantic Versioning (SemVer)](https://semver.org/):

- `MAJOR.MINOR.PATCH`
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

### GitHub Releases

1. **Create Release Tag**

   ```bash
   git tag -a v1.2.0 -m "Release version 1.2.0"
   git push origin v1.2.0
   ```

2. **GitHub Release Creation**
   - Use GitHub web interface or CLI
   - Include release notes
   - Attach compiled assets (optional)

3. **Release Assets**
   - Source code archive (automatic)
   - Compiled plugin bundle (optional)
   - Documentation files

### Automated Releases

GitHub Actions workflow example:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm test
      - name: Build plugin
        run: npm run build
      - name: Create Release
        uses: actions/create-release@v1
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
```

## Security Considerations

### Code Review

- All plugins should undergo peer review
- Use GitHub's security features
- Enable Dependabot for dependency updates

### Sandboxing

- Plugins run in isolated contexts
- Limited access to file system
- Network access restrictions
- Environment variable isolation

### Verification

Future verification system:

- Code signing for verified publishers
- Automated security scanning
- Community reporting mechanisms
- Malware detection

### Best Practices

1. **Input Validation**
   - Validate all external inputs
   - Sanitize user-provided data
   - Use type-safe APIs

2. **Error Handling**
   - Graceful error handling
   - No sensitive data in error messages
   - Proper logging practices

3. **Dependencies**
   - Minimal dependency usage
   - Regular security updates
   - Dependency pinning

## Future Migration Path

This GitHub-based system is designed to migrate smoothly to a centralized registry:

### Phase 1: GitHub Distribution (Current)

- Manual discovery via GitHub search
- CLI installation from repositories
- Basic metadata validation

### Phase 2: Index Service

- Automated plugin crawling
- Enhanced search capabilities
- Metadata aggregation

### Phase 3: Centralized Registry

- Dedicated registry server
- Web interface
- Advanced features (reviews, analytics)

### Migration Strategy

1. **Backward Compatibility**
   - Support GitHub URLs indefinitely
   - Gradual feature migration
   - User choice in distribution method

2. **Data Migration**
   - Automated plugin import
   - Metadata preservation
   - Version history migration

3. **Enhanced Features**
   - Dependency resolution
   - Security scanning
   - Community features

## Implementation Guidelines

### For Plugin Developers

1. **Repository Setup**
   - Create repository with proper naming
   - Add required topics
   - Include all required files

2. **Metadata Creation**
   - Complete `hatago.plugin.json`
   - Accurate version information
   - Clear documentation

3. **Testing**
   - Comprehensive unit tests
   - Integration testing
   - Example usage

4. **Documentation**
   - Clear README
   - API documentation
   - Configuration examples

### For CLI Implementation

1. **GitHub API Integration**
   - Search repository functionality
   - Release information retrieval
   - Rate limiting handling

2. **Plugin Management**
   - Installation/uninstallation
   - Version management
   - Dependency handling

3. **Local Registry**
   - Plugin tracking
   - Configuration management
   - Update notifications

## Examples

### Simple Tool Plugin

```typescript
// src/index.ts
import type { HatagoPlugin } from '@hatago/types'

export const weatherPlugin: HatagoPlugin = ({ server }) => {
  server.registerTool(
    {
      name: 'get-weather',
      description: 'Get current weather for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
    },
    async ({ location }) => {
      // Implementation
      return {
        content: [
          {
            type: 'text',
            text: `Weather in ${location}: Sunny, 25°C`,
          },
        ],
      }
    }
  )
}
```

### Resource Plugin

```typescript
// src/index.ts
import type { HatagoPlugin } from '@hatago/types'

export const configPlugin: HatagoPlugin = ({ server }) => {
  server.registerResource(
    {
      uri: 'config://settings',
      name: 'Application Settings',
      description: 'Current application configuration',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                version: '1.0.0',
                environment: 'production',
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
```

## Conclusion

This specification provides a foundation for decentralized plugin distribution while maintaining the flexibility to evolve into a more sophisticated system. By leveraging GitHub's existing infrastructure, we can quickly establish an ecosystem for Hatago plugins while building toward a more comprehensive solution.

The system balances ease of use for developers, security considerations, and future scalability, ensuring that the Hatago plugin ecosystem can grow organically while maintaining quality and consistency.

---

_This specification is version 1.0 and is subject to updates based on community feedback and implementation experience._
