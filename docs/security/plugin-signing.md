# Plugin Signature Verification

Hatago's plugin signature verification system provides cryptographic verification of plugin integrity and authenticity using Web Crypto API standards.

## Overview

The plugin security system offers:

- **Digital signatures** using Ed25519, RSA-PSS, or ECDSA-P256
- **Trusted key registry** for public key management
- **Signature verification** with automatic age checking
- **Development tools** for testing and key generation
- **Security metrics** and audit logging
- **Flexible policies** from permissive to strict verification

## Quick Start

### Enable Plugin Security

```bash
# Environment configuration
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=false  # Start permissive
NODE_ENV=development          # Allows test keys
```

### Test Signature Verification

```bash
# Generate test key and sign data
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"security.sign_test",
    "arguments":{"testData":"Hello Hatago Plugin"}
  }
}'

# Verify the signature
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"security.verify",
    "arguments":{
      "testData":"Hello Hatago Plugin",
      "signature":{
        "algorithm":"ed25519",
        "signature":"<signature_from_previous_call>",
        "keyId":"<keyId_from_previous_call>",
        "timestamp":"<timestamp_from_previous_call>"
      }
    }
  }
}'
```

## Signature Format

### Plugin Signature Structure

```typescript
interface PluginSignature {
  algorithm: 'ed25519' | 'rsa-pss' | 'ecdsa-p256'
  signature: string // Base64-encoded signature
  keyId: string // Public key identifier
  timestamp: string // ISO 8601 signature timestamp
  certificates?: string[] // Optional certificate chain
}
```

### Example Signature

```json
{
  "algorithm": "ed25519",
  "signature": "MEUCIQDxQ2...",
  "keyId": "a1b2c3d4e5f6g7h8",
  "timestamp": "2024-08-15T10:30:00.000Z",
  "certificates": ["-----BEGIN CERTIFICATE-----\n..."]
}
```

## Supported Algorithms

| Algorithm      | Key Size | Security Level | Use Case                        |
| -------------- | -------- | -------------- | ------------------------------- |
| **Ed25519**    | 256-bit  | High           | Recommended for new deployments |
| **RSA-PSS**    | 2048-bit | High           | Legacy compatibility            |
| **ECDSA-P256** | 256-bit  | High           | FIPS compliance                 |

### Algorithm Selection

```typescript
// Ed25519 (recommended)
const keyPair = await verifier.generateKeyPair('ed25519')

// RSA-PSS for legacy systems
const keyPair = await verifier.generateKeyPair('rsa-pss')

// ECDSA for FIPS environments
const keyPair = await verifier.generateKeyPair('ecdsa-p256')
```

## Key Management

### Trusted Key Registry

```typescript
import { InMemoryKeyRegistry } from '@hatago/core'

const keyRegistry = new InMemoryKeyRegistry()

// Add trusted key
await keyRegistry.addKey(keyId, publicKey, true, {
  algorithm: 'ed25519',
  issuer: 'Hatago Plugin Authority',
  subject: 'plugin-signing-key',
  validFrom: '2024-01-01T00:00:00Z',
  validTo: '2025-01-01T00:00:00Z',
})
```

### Development Keys

```bash
# Generate development key via MCP
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "security.generate_key",
    "arguments": {
      "algorithm": "ed25519"
    }
  }
}
```

### Production Key Deployment

For production environments:

1. **Generate keys offline** using secure key generation tools
2. **Store private keys securely** in HSMs or key management systems
3. **Distribute public keys** through secure channels
4. **Implement key rotation** policies

## Verification Process

### Automatic Verification

```typescript
import { PluginVerifier } from '@hatago/core'

const verifier = new PluginVerifier({
  enabled: true,
  requireSigned: true,
  maxSignatureAge: 24 * 60 * 60 * 1000, // 24 hours
  allowTestKeys: false,
})

const result = await verifier.verifyPlugin(pluginData, signature)

if (result.valid) {
  console.log('Plugin signature verified:', result.signer)
} else {
  console.error('Verification failed:', result.message)
}
```

### Verification Statuses

| Status      | Description                     | Action             |
| ----------- | ------------------------------- | ------------------ |
| `valid`     | Signature verified successfully | Allow plugin       |
| `invalid`   | Signature verification failed   | Block plugin       |
| `expired`   | Signature too old               | Require re-signing |
| `untrusted` | Key not in trusted registry     | Review key trust   |
| `error`     | Verification error occurred     | Investigate issue  |

## Security Policies

### Development Policy (Permissive)

```bash
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=false
NODE_ENV=development
```

- Verification enabled but not enforced
- Test keys allowed
- Unsigned plugins permitted
- Detailed logging for debugging

### Production Policy (Strict)

```bash
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=true
NODE_ENV=production
```

- Signature verification enforced
- Only trusted keys accepted
- Unsigned plugins blocked
- Security audit logging

### Air-Gapped Policy (Maximum Security)

```bash
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=true
PLUGIN_ALLOW_TEST_KEYS=false
PLUGIN_MAX_SIGNATURE_AGE_HOURS=1
```

- Strict verification with short signature validity
- No test keys allowed
- Enhanced monitoring and alerting

## Plugin Signing Workflow

### 1. Development Signing

```typescript
// Generate key pair for development
const { publicKey, privateKey, keyId } = await verifier.generateKeyPair('ed25519')

// Sign plugin
const pluginData = await fs.readFile('my-plugin.js')
const signature = await verifier.signPlugin(
  new Uint8Array(pluginData),
  privateKey,
  keyId,
  'ed25519'
)

// Save signature with plugin
const manifest = {
  name: 'my-plugin',
  version: '1.0.0',
  signature,
}
```

### 2. CI/CD Integration

```bash
#!/bin/bash
# Build and sign plugin in CI/CD

# Build plugin
npm run build

# Sign with CI key
hatago-sign --plugin dist/plugin.js --key $CI_SIGNING_KEY --output plugin.sig

# Verify signature
hatago-verify --plugin dist/plugin.js --signature plugin.sig

# Package with signature
tar czf my-plugin-1.0.0.tgz dist/ plugin.sig manifest.json
```

### 3. Production Deployment

```typescript
// Verify plugin before loading
const pluginData = await loadPluginData('my-plugin-1.0.0.tgz')
const signature = await loadPluginSignature('my-plugin-1.0.0.tgz')

const result = await verifier.verifyPlugin(pluginData, signature)

if (result.valid) {
  await loadPlugin(pluginData)
} else {
  throw new Error(`Plugin verification failed: ${result.message}`)
}
```

## Security Monitoring

### HTTP Endpoints

```bash
# Check security status
curl http://localhost:8787/security/status

# List trusted keys
curl http://localhost:8787/security/keys
```

### MCP Tools

```bash
# Get security metrics
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "security.status"
  }
}

# View verification history
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "security.verify",
    "arguments": {"action": "history"}
  }
}
```

### Security Metrics

```json
{
  "metrics": {
    "totalVerifications": 150,
    "validSignatures": 145,
    "invalidSignatures": 2,
    "untrustedKeys": 2,
    "expiredSignatures": 1,
    "blockedPlugins": 3
  }
}
```

## Integration Examples

### Plugin Development

```typescript
// my-plugin/index.ts
import { HatagoPlugin } from '@hatago/core'

export const myPlugin: HatagoPlugin = ({ server, getLogger }) => {
  const logger = getLogger('my-plugin')

  server.registerTool(
    'my.tool',
    {
      title: 'My Secure Tool',
      description: 'A tool with verified integrity',
    },
    async args => {
      logger.info('Secure tool called', { args })
      return { content: [{ type: 'text', text: 'Hello from verified plugin!' }] }
    }
  )
}

// Export signature for verification
export const PLUGIN_SIGNATURE = {
  algorithm: 'ed25519',
  signature: 'MEUCIQDxQ2...',
  keyId: 'a1b2c3d4e5f6g7h8',
  timestamp: '2024-08-15T10:30:00.000Z',
}
```

### Automated Verification

```typescript
// plugin-loader.ts
import { PluginVerifier } from '@hatago/core'

class SecurePluginLoader {
  constructor(private verifier: PluginVerifier) {}

  async loadPlugin(pluginPath: string): Promise<void> {
    const { plugin, signature } = await this.loadPluginWithSignature(pluginPath)

    const result = await this.verifier.verifyPlugin(plugin, signature)

    if (!result.valid) {
      throw new Error(`Plugin verification failed: ${result.message}`)
    }

    // Load verified plugin
    await this.instantiatePlugin(plugin)
  }
}
```

## Best Practices

### 1. Key Security

- **Generate keys offline** in secure environments
- **Use hardware security modules** for production keys
- **Implement key rotation** policies (e.g., annual)
- **Backup keys securely** with proper access controls

### 2. Signature Management

- **Sign during build** process, not at runtime
- **Include timestamp** for signature freshness validation
- **Embed signatures** in plugin metadata
- **Verify before execution** in all environments

### 3. Trust Policies

- **Start permissive** in development (warnings only)
- **Gradual enforcement** during testing phases
- **Strict enforcement** in production
- **Regular security audits** of trusted keys

### 4. Monitoring and Alerting

- **Log all verification attempts** with full context
- **Alert on verification failures** in production
- **Monitor signature age** and key expiration
- **Track plugin source** and provenance

## Troubleshooting

### Common Issues

**Signature verification failed**:

- Check signature format and encoding
- Verify key ID matches trusted registry
- Confirm algorithm compatibility

**Key not found**:

- Add public key to trusted registry
- Check key ID generation and storage
- Verify key export/import process

**Signature expired**:

- Re-sign plugin with current timestamp
- Adjust signature age policy if appropriate
- Implement automated re-signing

### Debug Commands

```bash
# Test key generation
curl -X POST http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{"name":"security.generate_key"}
}'

# Verify specific signature
curl -X POST http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"security.verify",
    "arguments":{"testData":"test","signature":{...}}
  }
}'

# Check security configuration
curl http://localhost:8787/security/status
```

## Security Considerations

### Threat Model

The plugin signature system protects against:

- **Tampered plugins** - Modifications detected through signature verification
- **Malicious plugins** - Only signed plugins from trusted sources
- **Supply chain attacks** - Verification of plugin provenance
- **Replay attacks** - Timestamp validation prevents old signatures

### Limitations

- **Key compromise** - Compromised signing keys invalidate trust
- **Side-channel attacks** - Implementation assumes secure key storage
- **Social engineering** - Trust decisions still require human judgment
- **Performance impact** - Signature verification adds computational overhead

### Compliance

- **FIPS 140-2** compatibility with approved algorithms
- **Common Criteria** evaluation for high-security deployments
- **SOC 2 Type II** controls for plugin integrity
- **ISO 27001** security management framework compliance
