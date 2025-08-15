/**
 * Plugin signature verification system for Hatago
 * Provides cryptographic verification of plugin integrity and authenticity
 */

import { createDefaultLogger } from '../logger.js'

const logger = createDefaultLogger('plugin-verifier')

/**
 * Plugin signature information
 */
export interface PluginSignature {
  /** Algorithm used for signing */
  algorithm: 'ed25519' | 'rsa-pss' | 'ecdsa-p256'
  /** Base64-encoded signature */
  signature: string
  /** Public key identifier */
  keyId: string
  /** Timestamp when signed */
  timestamp: string
  /** Optional certificate chain */
  certificates?: string[]
}

/**
 * Plugin verification result
 */
export interface VerificationResult {
  /** Whether signature is valid */
  valid: boolean
  /** Verification status */
  status: 'valid' | 'invalid' | 'expired' | 'untrusted' | 'error'
  /** Human-readable message */
  message: string
  /** Signer information */
  signer?: {
    keyId: string
    issuer?: string
    subject?: string
  }
  /** Verification timestamp */
  verifiedAt: string
  /** Error details if verification failed */
  error?: string
}

/**
 * Trusted key registry
 */
export interface TrustedKeyRegistry {
  /** Get public key by ID */
  getKey(keyId: string): Promise<CryptoKey | null>
  /** Check if key is trusted */
  isTrusted(keyId: string): Promise<boolean>
  /** Get key metadata */
  getKeyInfo(keyId: string): Promise<{
    algorithm: string
    issuer?: string
    subject?: string
    validFrom?: string
    validTo?: string
  } | null>
}

/**
 * Configuration for plugin verification
 */
export interface PluginVerifierConfig {
  /** Enable signature verification */
  enabled?: boolean
  /** Require all plugins to be signed */
  requireSigned?: boolean
  /** Maximum signature age in milliseconds */
  maxSignatureAge?: number
  /** Trusted key registry */
  keyRegistry?: TrustedKeyRegistry
  /** Allow development/test keys */
  allowTestKeys?: boolean
}

/**
 * Simple in-memory key registry for development
 */
export class InMemoryKeyRegistry implements TrustedKeyRegistry {
  private keys = new Map<
    string,
    {
      key: CryptoKey
      trusted: boolean
      metadata: {
        algorithm: string
        issuer?: string
        subject?: string
        validFrom?: string
        validTo?: string
      }
    }
  >()

  async addKey(
    keyId: string,
    key: CryptoKey,
    trusted: boolean = false,
    metadata: {
      algorithm: string
      issuer?: string
      subject?: string
      validFrom?: string
      validTo?: string
    }
  ): Promise<void> {
    this.keys.set(keyId, { key, trusted, metadata })
    logger.info('Key added to registry', { keyId, trusted, algorithm: metadata.algorithm })
  }

  async getKey(keyId: string): Promise<CryptoKey | null> {
    const entry = this.keys.get(keyId)
    return entry?.key || null
  }

  async isTrusted(keyId: string): Promise<boolean> {
    const entry = this.keys.get(keyId)
    return entry?.trusted || false
  }

  async getKeyInfo(keyId: string) {
    const entry = this.keys.get(keyId)
    return entry?.metadata || null
  }

  listKeys(): string[] {
    return Array.from(this.keys.keys())
  }
}

/**
 * Plugin signature verifier
 */
export class PluginVerifier {
  private config: Required<PluginVerifierConfig>
  private defaultRegistry: InMemoryKeyRegistry

  constructor(config: PluginVerifierConfig = {}) {
    this.defaultRegistry = new InMemoryKeyRegistry()

    this.config = {
      enabled: config.enabled ?? true,
      requireSigned: config.requireSigned ?? false,
      maxSignatureAge: config.maxSignatureAge ?? 24 * 60 * 60 * 1000, // 24 hours
      keyRegistry: config.keyRegistry ?? this.defaultRegistry,
      allowTestKeys: config.allowTestKeys ?? true,
    }

    logger.info('Plugin verifier initialized', {
      enabled: this.config.enabled,
      requireSigned: this.config.requireSigned,
      maxSignatureAge: this.config.maxSignatureAge,
    })
  }

  /**
   * Verify plugin signature
   */
  async verifyPlugin(
    pluginData: Uint8Array,
    signature: PluginSignature
  ): Promise<VerificationResult> {
    const verifiedAt = new Date().toISOString()

    if (!this.config.enabled) {
      return {
        valid: true,
        status: 'valid',
        message: 'Signature verification disabled',
        verifiedAt,
      }
    }

    try {
      // Check signature age
      const signatureAge = Date.now() - new Date(signature.timestamp).getTime()
      if (signatureAge > this.config.maxSignatureAge) {
        return {
          valid: false,
          status: 'expired',
          message: `Signature expired (age: ${Math.round(signatureAge / 1000 / 60)} minutes)`,
          verifiedAt,
        }
      }

      // Get public key
      const publicKey = await this.config.keyRegistry.getKey(signature.keyId)
      if (!publicKey) {
        return {
          valid: false,
          status: 'untrusted',
          message: `Unknown key ID: ${signature.keyId}`,
          verifiedAt,
        }
      }

      // Check if key is trusted (unless test keys are allowed)
      const isTrusted = await this.config.keyRegistry.isTrusted(signature.keyId)
      if (!isTrusted && !this.config.allowTestKeys) {
        return {
          valid: false,
          status: 'untrusted',
          message: `Untrusted key: ${signature.keyId}`,
          verifiedAt,
        }
      }

      // Verify signature
      const signatureBytes = this.base64ToBytes(signature.signature)
      const isValid = await this.cryptoVerify(
        signature.algorithm,
        publicKey,
        signatureBytes,
        pluginData
      )

      if (!isValid) {
        return {
          valid: false,
          status: 'invalid',
          message: 'Signature verification failed',
          verifiedAt,
        }
      }

      // Get signer info
      const keyInfo = await this.config.keyRegistry.getKeyInfo(signature.keyId)
      const signer = {
        keyId: signature.keyId,
        ...(keyInfo?.issuer && { issuer: keyInfo.issuer }),
        ...(keyInfo?.subject && { subject: keyInfo.subject }),
      }

      return {
        valid: true,
        status: 'valid',
        message: 'Signature verified successfully',
        signer,
        verifiedAt,
      }
    } catch (error) {
      logger.error('Plugin verification error', { keyId: signature.keyId }, error as Error)

      return {
        valid: false,
        status: 'error',
        message: 'Verification error occurred',
        verifiedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Sign plugin data (for development/testing)
   */
  async signPlugin(
    pluginData: Uint8Array,
    privateKey: CryptoKey,
    keyId: string,
    algorithm: PluginSignature['algorithm'] = 'ed25519'
  ): Promise<PluginSignature> {
    try {
      const signatureBytes = await this.cryptoSign(algorithm, privateKey, pluginData)
      const signature = this.bytesToBase64(signatureBytes)

      return {
        algorithm,
        signature,
        keyId,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.error('Plugin signing error', { keyId, algorithm }, error as Error)
      throw new Error(
        `Failed to sign plugin: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Generate key pair for signing (development/testing)
   */
  async generateKeyPair(algorithm: PluginSignature['algorithm'] = 'ed25519'): Promise<{
    publicKey: CryptoKey
    privateKey: CryptoKey
    keyId: string
  }> {
    const keyPair = await this.generateCryptoKeyPair(algorithm)
    const keyId = await this.generateKeyId(keyPair.publicKey)

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyId,
    }
  }

  /**
   * Add trusted key to default registry
   */
  async addTrustedKey(
    keyId: string,
    publicKey: CryptoKey,
    metadata: {
      algorithm: string
      issuer?: string
      subject?: string
      validFrom?: string
      validTo?: string
    }
  ): Promise<void> {
    if (this.defaultRegistry) {
      await this.defaultRegistry.addKey(keyId, publicKey, true, metadata)
    }
  }

  // Private methods for crypto operations

  private async cryptoVerify(
    algorithm: PluginSignature['algorithm'],
    publicKey: CryptoKey,
    signature: Uint8Array,
    data: Uint8Array
  ): Promise<boolean> {
    const alg = this.getWebCryptoAlgorithm(algorithm)
    // Create ArrayBuffer copies to ensure correct type
    const signatureBuffer = signature.slice().buffer
    const dataBuffer = data.slice().buffer
    return await crypto.subtle.verify(alg, publicKey, signatureBuffer, dataBuffer)
  }

  private async cryptoSign(
    algorithm: PluginSignature['algorithm'],
    privateKey: CryptoKey,
    data: Uint8Array
  ): Promise<Uint8Array> {
    const alg = this.getWebCryptoAlgorithm(algorithm)
    // Create ArrayBuffer copy to ensure correct type
    const dataBuffer = data.slice().buffer
    const signature = await crypto.subtle.sign(alg, privateKey, dataBuffer)
    return new Uint8Array(signature)
  }

  private async generateCryptoKeyPair(
    algorithm: PluginSignature['algorithm']
  ): Promise<CryptoKeyPair> {
    const keyGenAlg = this.getKeyGenerationAlgorithm(algorithm)
    const result = await crypto.subtle.generateKey(
      keyGenAlg,
      true, // extractable
      ['sign', 'verify']
    )

    // Ensure we got a key pair, not a single key
    if ('privateKey' in result && 'publicKey' in result) {
      return result as CryptoKeyPair
    } else {
      throw new Error('Expected CryptoKeyPair but got CryptoKey')
    }
  }

  private async generateKeyId(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    const hash = await crypto.subtle.digest('SHA-256', exported)
    return this.bytesToBase64(new Uint8Array(hash)).slice(0, 16)
  }

  private getWebCryptoAlgorithm(algorithm: PluginSignature['algorithm']): AlgorithmIdentifier {
    switch (algorithm) {
      case 'ed25519':
        return 'Ed25519'
      case 'rsa-pss':
        return {
          name: 'RSA-PSS',
          saltLength: 32,
        } as RsaPssParams
      case 'ecdsa-p256':
        return {
          name: 'ECDSA',
          hash: 'SHA-256',
        } as EcdsaParams
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`)
    }
  }

  private getKeyGenerationAlgorithm(algorithm: PluginSignature['algorithm']): AlgorithmIdentifier {
    switch (algorithm) {
      case 'ed25519':
        return 'Ed25519'
      case 'rsa-pss':
        return {
          name: 'RSA-PSS',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        } as RsaHashedKeyGenParams
      case 'ecdsa-p256':
        return {
          name: 'ECDSA',
          namedCurve: 'P-256',
        } as EcKeyGenParams
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`)
    }
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }

  private bytesToBase64(bytes: Uint8Array): string {
    const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
    return btoa(binaryString)
  }
}

/**
 * Default plugin verifier instance
 */
export const defaultPluginVerifier = new PluginVerifier({
  enabled: true,
  requireSigned: false, // Start with false for development
  allowTestKeys: true,
})
