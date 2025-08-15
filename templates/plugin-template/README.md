# @{{SCOPE}}/{{PLUGIN_NAME}}

{{DESCRIPTION}}

## Installation

```bash
npm install @{{SCOPE}}/{{PLUGIN_NAME}}
```

## Usage

### Basic Usage

```typescript
import { createApp } from '@hatago/core'
import {{PLUGIN_NAME_CAMEL}}Plugin from '@{{SCOPE}}/{{PLUGIN_NAME}}'

const { app, server } = await createApp({
  name: 'my-app',
  plugins: [
    {{PLUGIN_NAME_CAMEL}}Plugin({
      enabled: true,
      customOption: 'example'
    })
  ]
})
```

### Configuration

| Option         | Type      | Default     | Description                 |
| -------------- | --------- | ----------- | --------------------------- |
| `enabled`      | `boolean` | `true`      | Enable/disable the plugin   |
| `customOption` | `string`  | `undefined` | Custom configuration option |

### Available Tools

#### {{PLUGIN_NAME}}.example

Example tool provided by this plugin.

**Input:**

- `message` (string, optional): Custom message to return

**Output:**

- Text response with the provided message

## Capabilities

This plugin requires the following capabilities:
{{CAPABILITIES_LIST}}

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run type checking
npm run typecheck

# Format code
npm run format:fix

# Lint code
npm run lint:fix
```

## License

MIT
