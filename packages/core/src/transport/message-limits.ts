/**
 * Message size limits and validation for MCP transport
 * Based on MCP specification recommendations
 */

export interface MessageLimits {
  /** Maximum message size in bytes (default: 10MB) */
  maxMessageSize: number

  /** Maximum header size in bytes (default: 8KB) */
  maxHeaderSize: number

  /** Maximum JSON depth (default: 32) */
  maxJsonDepth: number

  /** Maximum array length in JSON (default: 10000) */
  maxArrayLength: number

  /** Maximum string length in JSON (default: 1MB) */
  maxStringLength: number

  /** Enable size validation (default: true) */
  enabled: boolean
}

/**
 * Default message limits for MCP
 */
export const defaultMessageLimits: MessageLimits = {
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  maxHeaderSize: 8 * 1024, // 8KB
  maxJsonDepth: 32,
  maxArrayLength: 10000,
  maxStringLength: 1024 * 1024, // 1MB
  enabled: true,
}

/**
 * Strict message limits for production
 */
export const strictMessageLimits: MessageLimits = {
  maxMessageSize: 5 * 1024 * 1024, // 5MB
  maxHeaderSize: 4 * 1024, // 4KB
  maxJsonDepth: 16,
  maxArrayLength: 1000,
  maxStringLength: 512 * 1024, // 512KB
  enabled: true,
}

/**
 * Error thrown when message exceeds limits
 */
export class MessageSizeError extends Error {
  constructor(
    public readonly limit: string,
    public readonly actual: number,
    public readonly max: number
  ) {
    super(`Message exceeds ${limit}: ${actual} > ${max}`)
    this.name = 'MessageSizeError'
  }
}

/**
 * Validate message size
 */
export function validateMessageSize(message: string | ArrayBuffer, limits: MessageLimits): void {
  if (!limits.enabled) return

  const size =
    typeof message === 'string' ? new TextEncoder().encode(message).length : message.byteLength

  if (size > limits.maxMessageSize) {
    throw new MessageSizeError('maxMessageSize', size, limits.maxMessageSize)
  }
}

/**
 * Validate JSON structure depth and sizes
 */
export function validateJsonStructure(obj: unknown, limits: MessageLimits, depth = 0): void {
  if (!limits.enabled) return

  if (depth > limits.maxJsonDepth) {
    throw new MessageSizeError('maxJsonDepth', depth, limits.maxJsonDepth)
  }

  if (typeof obj === 'string' && obj.length > limits.maxStringLength) {
    throw new MessageSizeError('maxStringLength', obj.length, limits.maxStringLength)
  }

  if (Array.isArray(obj)) {
    if (obj.length > limits.maxArrayLength) {
      throw new MessageSizeError('maxArrayLength', obj.length, limits.maxArrayLength)
    }
    for (const item of obj) {
      validateJsonStructure(item, limits, depth + 1)
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      validateJsonStructure(value, limits, depth + 1)
    }
  }
}

/**
 * Create a size-limited JSON stringifier
 */
export function createLimitedStringifier(limits: MessageLimits) {
  return (obj: unknown): string => {
    // First validate the structure
    validateJsonStructure(obj, limits)

    // Then stringify with size check
    const json = JSON.stringify(obj)
    validateMessageSize(json, limits)

    return json
  }
}

/**
 * Create a size-limited JSON parser
 */
export function createLimitedParser(limits: MessageLimits) {
  return (text: string): unknown => {
    // First check raw message size
    validateMessageSize(text, limits)

    // Parse the JSON
    const obj = JSON.parse(text)

    // Then validate the structure
    validateJsonStructure(obj, limits)

    return obj
  }
}
