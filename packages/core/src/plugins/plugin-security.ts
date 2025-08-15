import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'
import { PluginVerifier, type PluginSignature, type VerificationResult } from '../security/plugin-verifier.js'
import { createDefaultLogger } from '../logger.js'

const logger = createDefaultLogger('plugin-security')

/**
 * Plugin security configuration
 */
export interface PluginSecurityConfig {
  /** Enable plugin signature verification */
  enabled?: boolean
  /** Require all plugins to be signed */
  requireSigned?: boolean
  /** Allow test/development keys */
  allowTestKeys?: boolean
  /** Maximum signature age in hours */
  maxSignatureAgeHours?: number
  /** Block unsigned plugins */
  blockUnsigned?: boolean
  /** Security endpoint path */
  endpoint?: string
}

/**
 * Plugin security metrics
 */
interface SecurityMetrics {
  totalVerifications: number
  validSignatures: number
  invalidSignatures: number
  untrustedKeys: number
  expiredSignatures: number
  blockedPlugins: number
}

/**
 * Plugin security management plugin
 * Provides signature verification and security monitoring for plugins
 */
export const pluginSecurity: HatagoPluginFactory<PluginSecurityConfig> =
  (config: PluginSecurityConfig = {}): HatagoPlugin =>
  ({ app, server }) => {
    const {
      enabled = true,
      requireSigned = false,
      allowTestKeys = true,
      maxSignatureAgeHours = 24,
      blockUnsigned = false,
      endpoint = '/security'
    } = config

    if (!enabled) {
      return
    }

    // Initialize verifier
    const verifier = new PluginVerifier({
      enabled,
      requireSigned,
      allowTestKeys,
      maxSignatureAge: maxSignatureAgeHours * 60 * 60 * 1000
    })

    // Security metrics
    const metrics: SecurityMetrics = {
      totalVerifications: 0,
      validSignatures: 0,
      invalidSignatures: 0,
      untrustedKeys: 0,
      expiredSignatures: 0,
      blockedPlugins: 0
    }

    // Track verification results
    const verificationHistory: Array<{
      timestamp: string
      pluginName?: string
      result: VerificationResult
    }> = []

    /**
     * Verify plugin signature
     */
    const verifyPluginSignature = async (
      pluginData: Uint8Array,
      signature: PluginSignature,
      pluginName?: string
    ): Promise<VerificationResult> => {
      metrics.totalVerifications++
      
      logger.info('Verifying plugin signature', {
        pluginName,
        keyId: signature.keyId,
        algorithm: signature.algorithm
      })

      const result = await verifier.verifyPlugin(pluginData, signature)
      
      // Update metrics
      switch (result.status) {
        case 'valid':
          metrics.validSignatures++
          break
        case 'invalid':
          metrics.invalidSignatures++
          break
        case 'untrusted':
          metrics.untrustedKeys++
          break
        case 'expired':
          metrics.expiredSignatures++
          break
      }

      // Track verification
      verificationHistory.push({
        timestamp: new Date().toISOString(),
        ...(pluginName && { pluginName }),
        result
      })

      // Keep only last 100 verifications
      if (verificationHistory.length > 100) {
        verificationHistory.shift()
      }

      // Log results
      if (result.valid) {
        logger.info('Plugin signature verified', {
          pluginName,
          keyId: signature.keyId,
          signer: result.signer
        })
      } else {
        logger.warn('Plugin signature verification failed', {
          pluginName,
          keyId: signature.keyId,
          status: result.status,
          message: result.message
        })

        if (blockUnsigned || requireSigned) {
          metrics.blockedPlugins++
          logger.error('Plugin blocked due to invalid signature', {
            pluginName,
            keyId: signature.keyId
          })
        }
      }

      return result
    }

    // HTTP endpoints for security management
    app.get(`${endpoint}/status`, c => {
      return c.json({
        enabled,
        requireSigned,
        allowTestKeys,
        maxSignatureAgeHours,
        blockUnsigned,
        metrics,
        recentVerifications: verificationHistory.slice(-10)
      })
    })

    app.get(`${endpoint}/keys`, c => {
      // Get list of trusted keys if default registry is used
      const keys = (verifier as any).defaultRegistry?.listKeys() || []
      return c.json({
        trustedKeys: keys.length,
        keys: keys.map((keyId: string) => ({ keyId }))
      })
    })

    // MCP tools for security management
    server.registerTool(
      'security.verify',
      {
        title: 'Verify Plugin Signature',
        description: 'Verify a plugin signature for testing purposes',
        inputSchema: {}
      },
      async (args: any) => {
        const { pluginName, signature, testData } = args

        if (!signature || !testData) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Missing required parameters (signature, testData)'
              }
            ]
          }
        }

        try {
          // Convert test data to bytes (for demo purposes)
          const pluginData = new TextEncoder().encode(testData)
          const result = await verifyPluginSignature(pluginData, signature, pluginName)

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  pluginName,
                  verification: result,
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          }
        } catch (error) {
          logger.error('Signature verification tool error', { pluginName }, error as Error)
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
              }
            ]
          }
        }
      }
    )

    server.registerTool(
      'security.generate_key',
      {
        title: 'Generate Test Key Pair',
        description: 'Generate a test key pair for plugin signing (development only)',
        inputSchema: {}
      },
      async (args: any) => {
        if (!allowTestKeys) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Test key generation is disabled'
              }
            ]
          }
        }

        try {
          const { algorithm = 'ed25519' } = args
          const keyPair = await verifier.generateKeyPair(algorithm)

          // Add to trusted keys for testing
          await verifier.addTrustedKey(keyPair.keyId, keyPair.publicKey, {
            algorithm,
            issuer: 'hatago-test',
            subject: `test-key-${keyPair.keyId}`,
            validFrom: new Date().toISOString()
          })

          logger.info('Test key pair generated', {
            keyId: keyPair.keyId,
            algorithm
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  keyId: keyPair.keyId,
                  algorithm,
                  message: 'Test key pair generated and added to trusted registry',
                  note: 'Private key is not displayed for security reasons'
                }, null, 2)
              }
            ]
          }
        } catch (error) {
          logger.error('Key generation error', {}, error as Error)
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
              }
            ]
          }
        }
      }
    )

    server.registerTool(
      'security.sign_test',
      {
        title: 'Sign Test Data',
        description: 'Sign test data with a generated key (development only)',
        inputSchema: {}
      },
      async (args: any) => {
        if (!allowTestKeys) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Test signing is disabled'
              }
            ]
          }
        }

        try {
          const { testData, algorithm = 'ed25519' } = args

          if (!testData) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Missing testData parameter'
                }
              ]
            }
          }

          // Generate new key pair for signing
          const keyPair = await verifier.generateKeyPair(algorithm)
          const pluginData = new TextEncoder().encode(testData)
          
          // Sign the data
          const signature = await verifier.signPlugin(
            pluginData,
            keyPair.privateKey,
            keyPair.keyId,
            algorithm
          )

          // Add public key to registry
          await verifier.addTrustedKey(keyPair.keyId, keyPair.publicKey, {
            algorithm,
            issuer: 'hatago-test',
            subject: `test-signing-key-${keyPair.keyId}`
          })

          logger.info('Test data signed', {
            keyId: keyPair.keyId,
            algorithm,
            dataLength: testData.length
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  testData,
                  signature,
                  message: 'Test data signed successfully',
                  verification_command: `Use security.verify tool with this signature and testData`
                }, null, 2)
              }
            ]
          }
        } catch (error) {
          logger.error('Test signing error', {}, error as Error)
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
              }
            ]
          }
        }
      }
    )

    server.registerTool(
      'security.status',
      {
        title: 'Security Status',
        description: 'Get plugin security system status and metrics',
        inputSchema: {}
      },
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                config: {
                  enabled,
                  requireSigned,
                  allowTestKeys,
                  maxSignatureAgeHours,
                  blockUnsigned
                },
                metrics,
                recentVerifications: verificationHistory.slice(-5).map(v => ({
                  timestamp: v.timestamp,
                  pluginName: v.pluginName,
                  status: v.result.status,
                  valid: v.result.valid
                }))
              }, null, 2)
            }
          ]
        }
      }
    )

    logger.info('Plugin security system initialized', {
      enabled,
      requireSigned,
      allowTestKeys,
      maxSignatureAgeHours,
      blockUnsigned,
      endpoint
    })

    // Export verifier for use by other components
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__hatago_plugin_verifier = verifier
    }
  }